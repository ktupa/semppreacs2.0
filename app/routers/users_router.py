# app/routers/users_router.py
"""
Router de Gerenciamento de Usuários e Grupos
Sistema completo de permissões granulares
"""
from __future__ import annotations

import os
import logging
from datetime import datetime
from typing import Optional, List, Dict, Any
from fastapi import APIRouter, HTTPException, Depends, status
from pydantic import BaseModel, Field, EmailStr
from passlib.context import CryptContext
import json
from pathlib import Path

log = logging.getLogger("semppre-bridge.users")

router = APIRouter(prefix="/users-management", tags=["Gerenciamento de Usuários"])

# Arquivos de dados
DATA_DIR = Path("data")
USERS_FILE = DATA_DIR / "users.json"
GROUPS_FILE = DATA_DIR / "groups.json"
PERMISSIONS_FILE = DATA_DIR / "permissions.json"

pwd_context = CryptContext(schemes=["sha256_crypt"], deprecated="auto")


# ============ Models ============

class GroupCreate(BaseModel):
    """Schema para criação de grupo."""
    name: str = Field(..., min_length=2, max_length=50)
    description: Optional[str] = None
    permissions: List[str] = []


class GroupUpdate(BaseModel):
    """Schema para atualização de grupo."""
    name: Optional[str] = None
    description: Optional[str] = None
    permissions: Optional[List[str]] = None


class GroupResponse(BaseModel):
    """Schema de resposta de grupo."""
    id: str
    name: str
    description: Optional[str]
    permissions: List[str]
    created_at: str
    is_system: bool = False
    user_count: int = 0


class UserCreateFull(BaseModel):
    """Schema completo para criação de usuário."""
    username: str = Field(..., min_length=3, max_length=50)
    email: EmailStr
    password: str = Field(..., min_length=6)
    full_name: Optional[str] = None
    group_id: str = "operator"
    is_active: bool = True


class UserUpdateFull(BaseModel):
    """Schema para atualização de usuário."""
    email: Optional[EmailStr] = None
    full_name: Optional[str] = None
    group_id: Optional[str] = None
    is_active: Optional[bool] = None


class UserResponseFull(BaseModel):
    """Schema de resposta de usuário com grupo."""
    id: str
    username: str
    email: str
    full_name: Optional[str]
    group_id: str
    group_name: str
    permissions: List[str]
    is_active: bool
    created_at: str
    last_login: Optional[str]


class PermissionCategory(BaseModel):
    """Categoria de permissões."""
    category: str
    permissions: Dict[str, str]


# ============ Funções auxiliares ============

def load_json_file(filepath: Path, default: dict = None) -> dict:
    """Carrega arquivo JSON."""
    if not filepath.exists():
        if default is not None:
            filepath.parent.mkdir(parents=True, exist_ok=True)
            filepath.write_text(json.dumps(default, indent=2))
            return default
        return {}
    try:
        return json.loads(filepath.read_text())
    except Exception as e:
        log.error(f"Erro ao carregar {filepath}: {e}")
        return default or {}


def save_json_file(filepath: Path, data: dict):
    """Salva arquivo JSON."""
    filepath.parent.mkdir(parents=True, exist_ok=True)
    filepath.write_text(json.dumps(data, indent=2, ensure_ascii=False))


def load_groups() -> dict:
    """Carrega grupos."""
    default = {
        "admin": {
            "id": "1",
            "name": "Administradores",
            "description": "Acesso total ao sistema",
            "permissions": ["*"],
            "created_at": datetime.utcnow().isoformat(),
            "is_system": True
        },
        "operator": {
            "id": "2",
            "name": "Operadores",
            "description": "Gerenciamento de dispositivos",
            "permissions": [
                "devices.view", "devices.edit", "devices.reboot", "devices.provision",
                "config.view", "backup.view", "backup.create", "logs.view", "reports.view"
            ],
            "created_at": datetime.utcnow().isoformat(),
            "is_system": True
        },
        "viewer": {
            "id": "3",
            "name": "Visualizadores",
            "description": "Apenas visualização",
            "permissions": ["devices.view", "config.view", "logs.view", "reports.view"],
            "created_at": datetime.utcnow().isoformat(),
            "is_system": True
        }
    }
    return load_json_file(GROUPS_FILE, default)


def save_groups(groups: dict):
    """Salva grupos."""
    save_json_file(GROUPS_FILE, groups)


def load_users() -> dict:
    """Carrega usuários."""
    default = {
        "admin": {
            "id": "1",
            "username": "admin",
            "email": "admin@semppre.com",
            "password_hash": pwd_context.hash("admin123"),
            "full_name": "Administrador",
            "group_id": "admin",
            "is_active": True,
            "created_at": datetime.utcnow().isoformat(),
            "last_login": None,
        }
    }
    users = load_json_file(USERS_FILE, default)
    # Migrar usuários antigos que usam 'role' para 'group_id'
    for username, user in users.items():
        if 'role' in user and 'group_id' not in user:
            user['group_id'] = user.pop('role')
    return users


def save_users(users: dict):
    """Salva usuários."""
    save_json_file(USERS_FILE, users)


def load_permissions() -> dict:
    """Carrega definições de permissões."""
    return load_json_file(PERMISSIONS_FILE, {})


def get_user_permissions(user: dict) -> List[str]:
    """Obtém lista de permissões do usuário."""
    groups = load_groups()
    group = groups.get(user.get('group_id', 'viewer'), {})
    perms = group.get('permissions', [])
    if '*' in perms:
        # Todas as permissões
        all_perms = []
        permissions = load_permissions()
        for category, items in permissions.items():
            for perm in items.keys():
                all_perms.append(f"{category}.{perm}")
        return all_perms
    return perms


def has_permission(user: dict, permission: str) -> bool:
    """Verifica se usuário tem permissão."""
    groups = load_groups()
    group = groups.get(user.get('group_id', 'viewer'), {})
    perms = group.get('permissions', [])
    return '*' in perms or permission in perms


def count_users_in_group(group_id: str) -> int:
    """Conta usuários em um grupo."""
    users = load_users()
    return sum(1 for u in users.values() if u.get('group_id') == group_id)


# ============ Dependências de autenticação (importadas do auth_router) ============
# Importar após para evitar circular import
from app.routers.auth_router import get_current_user, UserInDB


def require_permission(permission: str):
    """Decorator para verificar permissão."""
    async def checker(current_user: UserInDB = Depends(get_current_user)):
        users = load_users()
        user_data = users.get(current_user.username, {})
        if not has_permission(user_data, permission):
            raise HTTPException(
                status_code=status.HTTP_403_FORBIDDEN,
                detail=f"Permissão necessária: {permission}",
            )
        return current_user
    return checker


# ============ Endpoints de Permissões ============

@router.get("/permissions", response_model=List[PermissionCategory])
async def list_permissions(current_user: UserInDB = Depends(get_current_user)):
    """
    Lista todas as permissões disponíveis no sistema.
    """
    permissions = load_permissions()
    return [
        PermissionCategory(category=cat, permissions=perms)
        for cat, perms in permissions.items()
    ]


@router.get("/my-permissions", response_model=List[str])
async def get_my_permissions(current_user: UserInDB = Depends(get_current_user)):
    """
    Lista permissões do usuário atual.
    """
    users = load_users()
    user_data = users.get(current_user.username, {})
    return get_user_permissions(user_data)


# ============ Endpoints de Grupos ============

@router.get("/groups", response_model=List[GroupResponse])
async def list_groups(current_user: UserInDB = Depends(require_permission("groups.view"))):
    """
    Lista todos os grupos.
    """
    groups = load_groups()
    return [
        GroupResponse(
            id=gid,  # usa a chave do dict como id
            name=g["name"],
            description=g.get("description"),
            permissions=g.get("permissions", []),
            created_at=g.get("created_at", ""),
            is_system=g.get("is_system", False),
            user_count=count_users_in_group(gid)
        )
        for gid, g in groups.items()
    ]


@router.get("/groups/{group_id}", response_model=GroupResponse)
async def get_group(
    group_id: str,
    current_user: UserInDB = Depends(require_permission("groups.view"))
):
    """
    Obtém detalhes de um grupo.
    """
    groups = load_groups()
    if group_id not in groups:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    
    g = groups[group_id]
    return GroupResponse(
        id=group_id,  # usa a chave do dict
        name=g["name"],
        description=g.get("description"),
        permissions=g.get("permissions", []),
        created_at=g.get("created_at", ""),
        is_system=g.get("is_system", False),
        user_count=count_users_in_group(group_id)
    )


@router.post("/groups", response_model=GroupResponse)
async def create_group(
    group: GroupCreate,
    current_user: UserInDB = Depends(require_permission("groups.create"))
):
    """
    Cria um novo grupo.
    """
    groups = load_groups()
    
    # Gerar ID a partir do nome
    group_id = group.name.lower().replace(" ", "_")
    if group_id in groups:
        raise HTTPException(status_code=400, detail="Grupo já existe")
    
    # Criar grupo
    new_group = {
        "id": str(len(groups) + 1),
        "name": group.name,
        "description": group.description,
        "permissions": group.permissions,
        "created_at": datetime.utcnow().isoformat(),
        "is_system": False
    }
    
    groups[group_id] = new_group
    save_groups(groups)
    
    log.info(f"Grupo '{group.name}' criado por {current_user.username}")
    
    return GroupResponse(
        id=group_id,  # usa a chave
        name=new_group["name"],
        description=new_group["description"],
        permissions=new_group["permissions"],
        created_at=new_group["created_at"],
        is_system=False,
        user_count=0
    )


@router.put("/groups/{group_id}", response_model=GroupResponse)
async def update_group(
    group_id: str,
    group_update: GroupUpdate,
    current_user: UserInDB = Depends(require_permission("groups.edit"))
):
    """
    Atualiza um grupo.
    """
    groups = load_groups()
    
    if group_id not in groups:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    
    g = groups[group_id]
    
    # Não permite editar grupos do sistema (exceto permissões)
    if g.get("is_system") and group_update.name:
        raise HTTPException(status_code=400, detail="Não é possível renomear grupos do sistema")
    
    if group_update.name:
        g["name"] = group_update.name
    if group_update.description is not None:
        g["description"] = group_update.description
    if group_update.permissions is not None:
        g["permissions"] = group_update.permissions
    
    groups[group_id] = g
    save_groups(groups)
    
    log.info(f"Grupo '{group_id}' atualizado por {current_user.username}")
    
    return GroupResponse(
        id=group_id,  # usa a chave
        name=g["name"],
        description=g.get("description"),
        permissions=g.get("permissions", []),
        created_at=g.get("created_at", ""),
        is_system=g.get("is_system", False),
        user_count=count_users_in_group(group_id)
    )


@router.delete("/groups/{group_id}")
async def delete_group(
    group_id: str,
    current_user: UserInDB = Depends(require_permission("groups.delete"))
):
    """
    Remove um grupo (apenas grupos não-sistema).
    """
    groups = load_groups()
    
    if group_id not in groups:
        raise HTTPException(status_code=404, detail="Grupo não encontrado")
    
    if groups[group_id].get("is_system"):
        raise HTTPException(status_code=400, detail="Não é possível remover grupos do sistema")
    
    # Verificar se há usuários no grupo
    user_count = count_users_in_group(group_id)
    if user_count > 0:
        raise HTTPException(
            status_code=400,
            detail=f"Existem {user_count} usuário(s) neste grupo. Mova-os antes de remover."
        )
    
    del groups[group_id]
    save_groups(groups)
    
    log.info(f"Grupo '{group_id}' removido por {current_user.username}")
    
    return {"message": "Grupo removido com sucesso"}


# ============ Endpoints de Usuários ============

@router.get("/users", response_model=List[UserResponseFull])
async def list_users_full(current_user: UserInDB = Depends(require_permission("users.view"))):
    """
    Lista todos os usuários com informações de grupo.
    """
    users = load_users()
    groups = load_groups()
    
    result = []
    for username, u in users.items():
        group_id = u.get("group_id", u.get("role", "viewer"))
        group = groups.get(group_id, {})
        result.append(UserResponseFull(
            id=u["id"],
            username=u["username"],
            email=u["email"],
            full_name=u.get("full_name"),
            group_id=group_id,
            group_name=group.get("name", group_id),
            permissions=get_user_permissions(u),
            is_active=u.get("is_active", True),
            created_at=u.get("created_at", ""),
            last_login=u.get("last_login"),
        ))
    
    return result


@router.get("/users/{username}", response_model=UserResponseFull)
async def get_user_full(
    username: str,
    current_user: UserInDB = Depends(require_permission("users.view"))
):
    """
    Obtém detalhes de um usuário.
    """
    users = load_users()
    groups = load_groups()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    u = users[username]
    group_id = u.get("group_id", u.get("role", "viewer"))
    group = groups.get(group_id, {})
    
    return UserResponseFull(
        id=u["id"],
        username=u["username"],
        email=u["email"],
        full_name=u.get("full_name"),
        group_id=group_id,
        group_name=group.get("name", group_id),
        permissions=get_user_permissions(u),
        is_active=u.get("is_active", True),
        created_at=u.get("created_at", ""),
        last_login=u.get("last_login"),
    )


@router.post("/users", response_model=UserResponseFull)
async def create_user_full(
    user: UserCreateFull,
    current_user: UserInDB = Depends(require_permission("users.create"))
):
    """
    Cria um novo usuário.
    """
    users = load_users()
    groups = load_groups()
    
    if user.username in users:
        raise HTTPException(status_code=400, detail="Nome de usuário já existe")
    
    # Verificar email duplicado
    for u in users.values():
        if u["email"] == user.email:
            raise HTTPException(status_code=400, detail="Email já cadastrado")
    
    # Verificar se grupo existe
    if user.group_id not in groups:
        raise HTTPException(status_code=400, detail="Grupo não encontrado")
    
    # Criar usuário
    new_user = {
        "id": str(len(users) + 1),
        "username": user.username,
        "email": user.email,
        "password_hash": pwd_context.hash(user.password),
        "full_name": user.full_name,
        "group_id": user.group_id,
        "is_active": user.is_active,
        "created_at": datetime.utcnow().isoformat(),
        "last_login": None,
    }
    
    users[user.username] = new_user
    save_users(users)
    
    group = groups.get(user.group_id, {})
    log.info(f"Usuário '{user.username}' criado por {current_user.username}")
    
    return UserResponseFull(
        id=new_user["id"],
        username=new_user["username"],
        email=new_user["email"],
        full_name=new_user["full_name"],
        group_id=user.group_id,
        group_name=group.get("name", user.group_id),
        permissions=get_user_permissions(new_user),
        is_active=new_user["is_active"],
        created_at=new_user["created_at"],
        last_login=None,
    )


@router.put("/users/{username}", response_model=UserResponseFull)
async def update_user_full(
    username: str,
    user_update: UserUpdateFull,
    current_user: UserInDB = Depends(require_permission("users.edit"))
):
    """
    Atualiza um usuário.
    """
    users = load_users()
    groups = load_groups()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    u = users[username]
    
    # Verificar email duplicado
    if user_update.email and user_update.email != u["email"]:
        for other in users.values():
            if other["email"] == user_update.email and other["username"] != username:
                raise HTTPException(status_code=400, detail="Email já cadastrado")
        u["email"] = user_update.email
    
    if user_update.full_name is not None:
        u["full_name"] = user_update.full_name
    
    if user_update.group_id:
        if user_update.group_id not in groups:
            raise HTTPException(status_code=400, detail="Grupo não encontrado")
        
        # Verificar se não está removendo o último admin
        if u.get("group_id") == "admin" and user_update.group_id != "admin":
            admin_count = sum(1 for usr in users.values() 
                           if usr.get("group_id") == "admin" and usr.get("is_active", True))
            if admin_count <= 1:
                raise HTTPException(
                    status_code=400,
                    detail="Não é possível rebaixar o único administrador ativo"
                )
        u["group_id"] = user_update.group_id
    
    if user_update.is_active is not None:
        if username == current_user.username and not user_update.is_active:
            raise HTTPException(status_code=400, detail="Você não pode desativar sua própria conta")
        u["is_active"] = user_update.is_active
    
    users[username] = u
    save_users(users)
    
    group_id = u.get("group_id", "viewer")
    group = groups.get(group_id, {})
    
    log.info(f"Usuário '{username}' atualizado por {current_user.username}")
    
    return UserResponseFull(
        id=u["id"],
        username=u["username"],
        email=u["email"],
        full_name=u.get("full_name"),
        group_id=group_id,
        group_name=group.get("name", group_id),
        permissions=get_user_permissions(u),
        is_active=u.get("is_active", True),
        created_at=u.get("created_at", ""),
        last_login=u.get("last_login"),
    )


@router.delete("/users/{username}")
async def delete_user_full(
    username: str,
    current_user: UserInDB = Depends(require_permission("users.delete"))
):
    """
    Remove um usuário.
    """
    if username == current_user.username:
        raise HTTPException(status_code=400, detail="Você não pode remover sua própria conta")
    
    users = load_users()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    # Verificar se não está removendo o último admin
    if users[username].get("group_id") == "admin":
        admin_count = sum(1 for u in users.values() 
                       if u.get("group_id") == "admin" and u.get("is_active", True))
        if admin_count <= 1:
            raise HTTPException(
                status_code=400,
                detail="Não é possível remover o único administrador ativo"
            )
    
    del users[username]
    save_users(users)
    
    log.info(f"Usuário '{username}' removido por {current_user.username}")
    
    return {"message": "Usuário removido com sucesso"}


@router.post("/users/{username}/reset-password")
async def reset_user_password(
    username: str,
    new_password: str = "123456",
    current_user: UserInDB = Depends(require_permission("users.edit"))
):
    """
    Reseta a senha de um usuário.
    """
    users = load_users()
    
    if username not in users:
        raise HTTPException(status_code=404, detail="Usuário não encontrado")
    
    if len(new_password) < 6:
        raise HTTPException(status_code=400, detail="Senha deve ter pelo menos 6 caracteres")
    
    users[username]["password_hash"] = pwd_context.hash(new_password)
    save_users(users)
    
    log.info(f"Senha do usuário '{username}' resetada por {current_user.username}")
    
    return {"message": f"Senha do usuário {username} alterada com sucesso"}


# ============ Estatísticas ============

@router.get("/stats")
async def get_user_stats(current_user: UserInDB = Depends(require_permission("users.view"))):
    """
    Estatísticas de usuários e grupos.
    """
    users = load_users()
    groups = load_groups()
    
    active_users = sum(1 for u in users.values() if u.get("is_active", True))
    inactive_users = len(users) - active_users
    
    users_by_group = {}
    for gid in groups.keys():
        users_by_group[gid] = count_users_in_group(gid)
    
    return {
        "total_users": len(users),
        "active_users": active_users,
        "inactive_users": inactive_users,
        "total_groups": len(groups),
        "users_by_group": users_by_group
    }
