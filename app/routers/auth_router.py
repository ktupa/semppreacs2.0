# app/routers/auth_router.py
"""
Router de Autenticação - JWT com login, registro e rotas protegidas.
"""
from __future__ import annotations

import os
import logging
from datetime import datetime, timedelta
from typing import Optional, List
from fastapi import APIRouter, HTTPException, Depends, status
from fastapi.security import HTTPBearer, HTTPAuthorizationCredentials
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
import jwt
import json
from pathlib import Path

log = logging.getLogger("semppre-bridge.auth")

router = APIRouter(prefix="/auth", tags=["Autenticação"])

# Configuração JWT
SECRET_KEY = os.getenv("JWT_SECRET_KEY", "semppre-acs-secret-key-change-in-production-2025")
ALGORITHM = "HS256"
ACCESS_TOKEN_EXPIRE_HOURS = 24

# Configuração de senha
# Usamos sha256_crypt como fallback portável (evita necessidade de bcrypt C bindings em alguns ambientes)
pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")

# Security
security = HTTPBearer(auto_error=False)

# Arquivo de usuários (em produção usar banco de dados)
USERS_FILE = Path("data/users.json")


# ============ Models ============

class UserCreate(BaseModel):
    """Schema para criação de usuário."""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    role: str = Field(default="operator", pattern="^(admin|operator|viewer)$")


class UserLogin(BaseModel):
    """Schema para login."""
    username: str
    password: str


class UserResponse(BaseModel):
    """Schema de resposta de usuário."""
    id: str
    username: str
    email: str
    full_name: Optional[str]
    role: str
    is_active: bool
    created_at: str
    last_login: Optional[str]


class TokenResponse(BaseModel):
    """Schema de resposta de token."""
    access_token: str
    token_type: str = "bearer"
    expires_in: int
    user: UserResponse


class UserInDB(BaseModel):
    """Usuário no banco de dados."""
    id: str
    username: str
    email: str
    password_hash: str
    full_name: Optional[str] = None
    role: str = "operator"
    is_active: bool = True
    created_at: str
    last_login: Optional[str] = None


# ============ Funções auxiliares ============

def load_users() -> dict:
    """Carrega usuários do arquivo JSON."""
    if not USERS_FILE.exists():
        USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
        # Criar usuário admin padrão
        default_users = {
            "admin": {
                "id": "1",
                "username": "admin",
                "email": "admin@semppre.com",
                "password_hash": pwd_context.hash("admin123"),
                "full_name": "Administrador",
                "role": "admin",
                "is_active": True,
                "created_at": datetime.utcnow().isoformat(),
                "last_login": None,
            }
        }
        USERS_FILE.write_text(json.dumps(default_users, indent=2))
        return default_users
    
    try:
        return json.loads(USERS_FILE.read_text())
    except Exception as e:
        log.error(f"Erro ao carregar usuários: {e}")
        return {}


def save_users(users: dict):
    """Salva usuários no arquivo JSON."""
    USERS_FILE.parent.mkdir(parents=True, exist_ok=True)
    USERS_FILE.write_text(json.dumps(users, indent=2))


def verify_password(plain_password: str, hashed_password: str) -> bool:
    """Verifica senha."""
    return pwd_context.verify(plain_password, hashed_password)


def get_password_hash(password: str) -> str:
    """Gera hash de senha."""
    return pwd_context.hash(password)


def create_access_token(data: dict, expires_delta: Optional[timedelta] = None) -> str:
    """Cria token JWT."""
    to_encode = data.copy()
    expire = datetime.utcnow() + (expires_delta or timedelta(hours=ACCESS_TOKEN_EXPIRE_HOURS))
    to_encode.update({"exp": expire, "iat": datetime.utcnow()})
    return jwt.encode(to_encode, SECRET_KEY, algorithm=ALGORITHM)


def decode_token(token: str) -> Optional[dict]:
    """Decodifica token JWT."""
    try:
        payload = jwt.decode(token, SECRET_KEY, algorithms=[ALGORITHM])
        return payload
    except jwt.ExpiredSignatureError:
        return None
    except (jwt.PyJWTError, jwt.exceptions.InvalidTokenError, Exception):
        # PyJWT 2.x usa PyJWTError, versões mais antigas usam JWTError
        return None


async def get_current_user(credentials: HTTPAuthorizationCredentials = Depends(security)) -> UserInDB:
    """Obtém usuário atual do token."""
    if not credentials:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token não fornecido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    payload = decode_token(credentials.credentials)
    if not payload:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido ou expirado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    username = payload.get("sub")
    if not username:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Token inválido",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    users = load_users()
    user_data = users.get(username)
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário não encontrado",
            headers={"WWW-Authenticate": "Bearer"},
        )
    
    if not user_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário desativado",
        )
    
    return UserInDB(**user_data)


async def get_current_user_optional(credentials: HTTPAuthorizationCredentials = Depends(security)) -> Optional[UserInDB]:
    """Obtém usuário atual opcionalmente (não requer autenticação)."""
    if not credentials:
        return None
    
    try:
        return await get_current_user(credentials)
    except HTTPException:
        return None


def require_role(allowed_roles: List[str]):
    """Decorator para verificar role do usuário."""
    async def role_checker(user: UserInDB = Depends(get_current_user)):
        if user.role not in allowed_roles:
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Acesso negado. Role necessária: {', '.join(allowed_roles)}",
            )
        return user
    return role_checker


# ============ Endpoints ============

@router.post("/login", response_model=TokenResponse)
async def login(credentials: UserLogin):
    """
    Realiza login e retorna token JWT.
    """
    users = load_users()
    user_data = users.get(credentials.username)
    
    if not user_data:
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos",
        )
    
    if not verify_password(credentials.password, user_data["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_401_UNAUTHORIZED,
            detail="Usuário ou senha incorretos",
        )
    
    if not user_data.get("is_active", True):
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Usuário desativado",
        )
    
    # Atualizar último login
    user_data["last_login"] = datetime.utcnow().isoformat()
    users[credentials.username] = user_data
    save_users(users)
    
    # Criar token - usar group_id como role (compatibilidade com novo formato)
    user_role = user_data.get("role") or user_data.get("group_id", "viewer")
    access_token = create_access_token(
        data={"sub": credentials.username, "role": user_role}
    )
    
    return TokenResponse(
        access_token=access_token,
        expires_in=ACCESS_TOKEN_EXPIRE_HOURS * 3600,
        user=UserResponse(
            id=user_data["id"],
            username=user_data["username"],
            email=user_data["email"],
            full_name=user_data.get("full_name"),
            role=user_role,
            is_active=user_data["is_active"],
            created_at=user_data["created_at"],
            last_login=user_data["last_login"],
        ),
    )


@router.post("/register", response_model=UserResponse)
async def register(user: UserCreate, current_user: UserInDB = Depends(require_role(["admin"]))):
    """
    Registra novo usuário (apenas admin).
    """
    users = load_users()
    
    # Verificar se usuário já existe
    if user.username in users:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nome de usuário já existe",
        )
    
    # Verificar email duplicado
    for u in users.values():
        if u["email"] == user.email:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Email já cadastrado",
            )
    
    # Criar usuário
    new_user = {
        "id": str(len(users) + 1),
        "username": user.username,
        "email": user.email,
        "password_hash": get_password_hash(user.password),
        "full_name": user.full_name,
        "role": user.role,
        "group_id": user.role,  # Compatibilidade com novo formato
        "is_active": True,
        "created_at": datetime.utcnow().isoformat(),
        "last_login": None,
    }
    
    users[user.username] = new_user
    save_users(users)
    
    log.info(f"Novo usuário criado: {user.username} por {current_user.username}")
    
    return UserResponse(
        id=new_user["id"],
        username=new_user["username"],
        email=new_user["email"],
        full_name=new_user["full_name"],
        role=new_user.get("role") or new_user.get("group_id", "viewer"),
        is_active=new_user["is_active"],
        created_at=new_user["created_at"],
        last_login=new_user["last_login"],
    )


@router.get("/me", response_model=UserResponse)
async def get_me(current_user: UserInDB = Depends(get_current_user)):
    """
    Retorna dados do usuário logado.
    """
    return UserResponse(
        id=current_user.id,
        username=current_user.username,
        email=current_user.email,
        full_name=current_user.full_name,
        role=current_user.role,
        is_active=current_user.is_active,
        created_at=current_user.created_at,
        last_login=current_user.last_login,
    )


@router.post("/refresh")
async def refresh_token(current_user: UserInDB = Depends(get_current_user)):
    """
    Renova o token JWT.
    """
    access_token = create_access_token(
        data={"sub": current_user.username, "role": current_user.role}
    )
    
    return {
        "access_token": access_token,
        "token_type": "bearer",
        "expires_in": ACCESS_TOKEN_EXPIRE_HOURS * 3600,
    }


@router.post("/logout")
async def logout():
    """
    Logout (o token é invalidado no cliente).
    """
    return {"message": "Logout realizado com sucesso"}


@router.put("/change-password")
async def change_password(
    old_password: str,
    new_password: str,
    current_user: UserInDB = Depends(get_current_user),
):
    """
    Altera senha do usuário logado.
    """
    users = load_users()
    user_data = users.get(current_user.username)
    
    if not verify_password(old_password, user_data["password_hash"]):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha atual incorreta",
        )
    
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Nova senha deve ter pelo menos 6 caracteres",
        )
    
    user_data["password_hash"] = get_password_hash(new_password)
    users[current_user.username] = user_data
    save_users(users)
    
    log.info(f"Senha alterada: {current_user.username}")
    
    return {"message": "Senha alterada com sucesso"}


@router.get("/users", response_model=List[UserResponse])
async def list_users(current_user: UserInDB = Depends(require_role(["admin"]))):
    """
    Lista todos os usuários (apenas admin).
    """
    users = load_users()
    return [
        UserResponse(
            id=u["id"],
            username=u["username"],
            email=u["email"],
            full_name=u.get("full_name"),
            role=u.get("role") or u.get("group_id", "viewer"),
            is_active=u["is_active"],
            created_at=u["created_at"],
            last_login=u.get("last_login"),
        )
        for u in users.values()
    ]


@router.put("/users/{username}/toggle")
async def toggle_user(username: str, current_user: UserInDB = Depends(require_role(["admin"]))):
    """
    Ativa/desativa usuário (apenas admin).
    """
    if username == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode desativar sua própria conta",
        )
    
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )
    
    users[username]["is_active"] = not users[username]["is_active"]
    save_users(users)
    
    status_text = "ativado" if users[username]["is_active"] else "desativado"
    log.info(f"Usuário {username} {status_text} por {current_user.username}")
    
    return {"message": f"Usuário {status_text} com sucesso"}


@router.delete("/users/{username}")
async def delete_user(username: str, current_user: UserInDB = Depends(require_role(["admin"]))):
    """
    Remove usuário (apenas admin).
    """
    if username == current_user.username:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Você não pode remover sua própria conta",
        )
    
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )
    
    # Não permite remover o último admin
    user_role = users[username].get("role") or users[username].get("group_id", "viewer")
    if user_role == "admin":
        admin_count = sum(1 for u in users.values() if (u.get("role") or u.get("group_id")) == "admin" and u["is_active"])
        if admin_count <= 1:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Não é possível remover o único administrador ativo",
            )
    
    del users[username]
    save_users(users)
    
    log.info(f"Usuário {username} removido por {current_user.username}")
    
    return {"message": "Usuário removido com sucesso"}


class UserUpdate(BaseModel):
    """Schema para atualização de usuário."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    role: Optional[str] = Field(None, pattern="^(admin|operator|viewer)$")
    is_active: Optional[bool] = None


@router.put("/users/{username}", response_model=UserResponse)
async def update_user(
    username: str,
    user_update: UserUpdate,
    current_user: UserInDB = Depends(require_role(["admin"]))
):
    """
    Atualiza dados de um usuário (apenas admin).
    """
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )
    
    user_data = users[username]
    
    # Verificar email duplicado se for alterado
    if user_update.email and user_update.email != user_data["email"]:
        for u in users.values():
            if u["email"] == user_update.email and u["username"] != username:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Email já cadastrado",
                )
        user_data["email"] = user_update.email
    
    if user_update.full_name is not None:
        user_data["full_name"] = user_update.full_name
    
    if user_update.role is not None:
        # Não permite remover o último admin
        current_role = user_data.get("role") or user_data.get("group_id", "viewer")
        if current_role == "admin" and user_update.role != "admin":
            admin_count = sum(1 for u in users.values() if (u.get("role") or u.get("group_id")) == "admin" and u["is_active"])
            if admin_count <= 1:
                raise HTTPException(
                    status_code=status.HTTP_400_BAD_REQUEST,
                    detail="Não é possível rebaixar o único administrador ativo",
                )
        user_data["role"] = user_update.role
        user_data["group_id"] = user_update.role  # Manter compatibilidade
    
    if user_update.is_active is not None:
        if username == current_user.username and not user_update.is_active:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Você não pode desativar sua própria conta",
            )
        user_data["is_active"] = user_update.is_active
    
    users[username] = user_data
    save_users(users)
    
    log.info(f"Usuário {username} atualizado por {current_user.username}")
    
    return UserResponse(
        id=user_data["id"],
        username=user_data["username"],
        email=user_data["email"],
        full_name=user_data.get("full_name"),
        role=user_data.get("role") or user_data.get("group_id", "viewer"),
        is_active=user_data["is_active"],
        created_at=user_data["created_at"],
        last_login=user_data.get("last_login"),
    )


@router.post("/users/{username}/reset-password")
async def reset_password(
    username: str,
    new_password: str = "123456",
    current_user: UserInDB = Depends(require_role(["admin"]))
):
    """
    Reseta a senha de um usuário (apenas admin).
    Senha padrão: 123456 (se não especificada)
    """
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )
    
    if len(new_password) < 6:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Senha deve ter pelo menos 6 caracteres",
        )
    
    users[username]["password_hash"] = get_password_hash(new_password)
    save_users(users)
    
    log.info(f"Senha do usuário {username} resetada por {current_user.username}")
    
    return {"message": f"Senha do usuário {username} alterada com sucesso"}


@router.get("/users/{username}", response_model=UserResponse)
async def get_user(username: str, current_user: UserInDB = Depends(require_role(["admin"]))):
    """
    Obtém dados de um usuário específico (apenas admin).
    """
    users = load_users()
    if username not in users:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="Usuário não encontrado",
        )
    
    u = users[username]
    return UserResponse(
        id=u["id"],
        username=u["username"],
        email=u["email"],
        full_name=u.get("full_name"),
        role=u.get("role") or u.get("group_id", "viewer"),
        is_active=u["is_active"],
        created_at=u["created_at"],
        last_login=u.get("last_login"),
    )


@router.get("/verify")
async def verify_token(current_user: UserInDB = Depends(get_current_user)):
    """
    Verifica se o token é válido.
    """
    return {
        "valid": True,
        "username": current_user.username,
        "role": current_user.role,
    }
