#!/bin/bash
#
# SemPPRE Bridge - Script de Primeira Atualização
# 
# Execute no cliente com:
#   curl -sSL https://raw.githubusercontent.com/ktupa/semppreacs2.0/main/updater/bootstrap.sh | bash
#
# Ou baixe e execute:
#   wget https://raw.githubusercontent.com/ktupa/semppreacs2.0/main/updater/bootstrap.sh
#   chmod +x bootstrap.sh && ./bootstrap.sh
#

set -e

RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

log_info() { echo -e "${BLUE}[INFO]${NC} $1"; }
log_success() { echo -e "${GREEN}[✓]${NC} $1"; }
log_warning() { echo -e "${YELLOW}[!]${NC} $1"; }
log_error() { echo -e "${RED}[✗]${NC} $1"; }

# Detecta o diretório de instalação automaticamente
# Prioridade: parâmetro > diretório atual > /opt/semppre-bridge > /opt/semppreacs2.0
if [ -n "$1" ]; then
    INSTALL_DIR="$1"
elif [ -f "./app/main.py" ]; then
    INSTALL_DIR="$(pwd)"
elif [ -d "/opt/semppre-bridge" ]; then
    INSTALL_DIR="/opt/semppre-bridge"
elif [ -d "/opt/semppreacs2.0" ]; then
    INSTALL_DIR="/opt/semppreacs2.0"
else
    # Tenta encontrar pelo processo
    INSTALL_DIR=$(dirname $(dirname $(readlink -f /proc/$(pgrep -f "uvicorn app.main")/cwd 2>/dev/null)) 2>/dev/null || echo "")
fi

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║      SemPPRE Bridge - Atualização do Sistema               ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar se o diretório existe
if [ ! -d "$INSTALL_DIR" ] || [ -z "$INSTALL_DIR" ]; then
    log_error "Diretório de instalação não encontrado!"
    log_info "Diretórios verificados: /opt/semppre-bridge, /opt/semppreacs2.0"
    log_info ""
    log_info "Execute o script de dentro do diretório do ACS:"
    log_info "  cd /opt/SEU_DIRETORIO && curl -sSL https://raw.githubusercontent.com/ktupa/semppreacs2.0/main/updater/bootstrap.sh | bash"
    log_info ""
    log_info "Ou passe o caminho como parâmetro:"
    log_info "  curl -sSL https://raw.githubusercontent.com/ktupa/semppreacs2.0/main/updater/bootstrap.sh | bash -s /opt/semppreacs2.0"
    exit 1
fi

log_info "Diretório encontrado: $INSTALL_DIR"
cd "$INSTALL_DIR"

# ============ DETECTAR USUÁRIO E GRUPO DO SISTEMA ============
# Detecta o usuário que roda o serviço (não root)
SERVICE_USER=""
SERVICE_GROUP=""

# Tenta detectar pelo processo uvicorn
if pgrep -f "uvicorn app.main" > /dev/null 2>&1; then
    SERVICE_USER=$(ps -o user= -p $(pgrep -f "uvicorn app.main" | head -1) 2>/dev/null | tr -d ' ')
fi

# Fallback: detectar pelo dono do arquivo .env ou app/main.py
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    if [ -f ".env" ]; then
        SERVICE_USER=$(stat -c '%U' .env 2>/dev/null)
        SERVICE_GROUP=$(stat -c '%G' .env 2>/dev/null)
    elif [ -f "app/main.py" ]; then
        SERVICE_USER=$(stat -c '%U' app/main.py 2>/dev/null)
        SERVICE_GROUP=$(stat -c '%G' app/main.py 2>/dev/null)
    fi
fi

# Fallback: usuário comum (suporte, ubuntu, etc)
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    for user in suporte ubuntu admin www-data; do
        if id "$user" &>/dev/null; then
            SERVICE_USER="$user"
            SERVICE_GROUP="$user"
            break
        fi
    done
fi

# Se ainda não encontrou, usa o usuário atual (se não for root)
if [ -z "$SERVICE_USER" ] || [ "$SERVICE_USER" = "root" ]; then
    if [ "$EUID" -ne 0 ]; then
        SERVICE_USER=$(whoami)
        SERVICE_GROUP=$(id -gn)
    fi
fi

log_info "Usuário do serviço detectado: ${SERVICE_USER:-root}:${SERVICE_GROUP:-root}"

# ============ SALVAR PERMISSÕES ATUAIS ============
log_info "Salvando permissões atuais dos arquivos de dados..."

# Salvar permissões do diretório data
declare -A DATA_PERMS
if [ -d "data" ]; then
    for file in data/*; do
        if [ -f "$file" ]; then
            DATA_PERMS["$file"]=$(stat -c '%U:%G' "$file" 2>/dev/null || echo "")
        fi
    done
fi

# Verificar se é um repositório git
if [ ! -d ".git" ]; then
    log_error "Não é um repositório Git!"
    log_info "Inicializando repositório Git..."
    
    git init
    git remote add origin https://github.com/ktupa/semppreacs2.0.git
fi

# ============ BACKUP DE ARQUIVOS IMPORTANTES ============
log_info "Salvando configurações locais..."

# Lista de arquivos a preservar (NÃO sobrescrever do repositório)
PROTECTED_FILES=(
    ".env"
    "data/users.json"
    "data/groups.json"
    "data/permissions.json"
    "data/semppre_acs.db"
    "data/ml/baselines.json"
    "data/ml/patterns.json"
    "data/ml/thresholds.json"
)

# Fazer backup dos arquivos protegidos
for file in "${PROTECTED_FILES[@]}"; do
    if [ -f "$file" ]; then
        cp "$file" "${file}.backup"
        log_success "$file salvo"
    fi
done

# ============ BAIXAR ATUALIZAÇÕES ============
log_info "Baixando atualizações do repositório..."

# Stash de mudanças locais
git stash 2>/dev/null || true

# Fetch
git fetch origin main --tags

# Obter versão atual (se existir)
CURRENT_VERSION="0.0.0"
if [ -f "VERSION" ]; then
    CURRENT_VERSION=$(cat VERSION)
fi

# Obter última versão disponível
LATEST_TAG=$(git describe --tags --abbrev=0 origin/main 2>/dev/null || echo "")

if [ -z "$LATEST_TAG" ]; then
    log_info "Nenhuma tag encontrada, atualizando para o último commit..."
    git checkout origin/main -- .
else
    log_info "Versão atual: $CURRENT_VERSION"
    log_info "Nova versão: $LATEST_TAG"
    
    # Checkout da versão mais recente
    git checkout origin/main -- .
fi

# ============ RESTAURAR ARQUIVOS PROTEGIDOS ============
log_info "Restaurando configurações locais..."

for file in "${PROTECTED_FILES[@]}"; do
    if [ -f "${file}.backup" ]; then
        mv "${file}.backup" "$file"
        log_success "$file restaurado"
    fi
done

# ============ CRIAR DIRETÓRIOS NECESSÁRIOS ============
mkdir -p logs
mkdir -p updater/backups
mkdir -p data/backups
mkdir -p data/ml

# Atualizar permissões apenas dos scripts
chmod +x updater/*.sh updater/*.py 2>/dev/null || true

# ============ CORRIGIR PERMISSÕES DOS ARQUIVOS DE DADOS ============
log_info "Corrigindo permissões dos arquivos de dados..."

if [ -n "$SERVICE_USER" ] && [ "$SERVICE_USER" != "root" ]; then
    # Corrigir permissões do diretório data e seus arquivos
    if [ -d "data" ]; then
        chown -R "${SERVICE_USER}:${SERVICE_GROUP}" data/ 2>/dev/null || sudo chown -R "${SERVICE_USER}:${SERVICE_GROUP}" data/ 2>/dev/null || log_warning "Não foi possível corrigir permissões de data/"
        chmod -R 755 data/ 2>/dev/null || true
        log_success "Permissões de data/ corrigidas para ${SERVICE_USER}:${SERVICE_GROUP}"
    fi
    
    # Corrigir permissões do diretório logs
    if [ -d "logs" ]; then
        chown -R "${SERVICE_USER}:${SERVICE_GROUP}" logs/ 2>/dev/null || sudo chown -R "${SERVICE_USER}:${SERVICE_GROUP}" logs/ 2>/dev/null || log_warning "Não foi possível corrigir permissões de logs/"
        chmod -R 755 logs/ 2>/dev/null || true
        log_success "Permissões de logs/ corrigidas"
    fi
    
    # Corrigir permissões do .env
    if [ -f ".env" ]; then
        chown "${SERVICE_USER}:${SERVICE_GROUP}" .env 2>/dev/null || sudo chown "${SERVICE_USER}:${SERVICE_GROUP}" .env 2>/dev/null || true
        chmod 600 .env 2>/dev/null || true
    fi
else
    log_warning "Usuário do serviço não detectado, permissões não alteradas"
fi

# ============ ATUALIZAR DEPENDÊNCIAS PYTHON ============
log_info "Atualizando dependências Python..."
if [ -d "venv" ]; then
    ./venv/bin/pip install -r requirements.txt -q 2>/dev/null || log_warning "pip install falhou"
elif [ -d ".venv" ]; then
    ./.venv/bin/pip install -r requirements.txt -q 2>/dev/null || log_warning "pip install falhou"
fi

# ============ ATUALIZAR FRONTEND ============
log_info "Atualizando Frontend..."
if [ -d "frontend" ]; then
    cd frontend
    npm install --silent 2>/dev/null || log_warning "npm install falhou (pode ser ok se não tiver node)"
    npm run build 2>/dev/null || log_warning "build falhou"
    cd ..
fi

# ============ ATUALIZAR VERSÃO ============
if [ -n "$LATEST_TAG" ]; then
    echo "${LATEST_TAG#v}" > VERSION
fi

# ============ VERIFICAÇÃO FINAL DE PERMISSÕES ============
log_info "Verificação final de permissões..."

# Lista de arquivos críticos que precisam ter permissão de escrita pelo serviço
CRITICAL_FILES=(
    "data/users.json"
    "data/groups.json"
    "data/permissions.json"
    "data/semppre_acs.db"
)

for file in "${CRITICAL_FILES[@]}"; do
    if [ -f "$file" ]; then
        OWNER=$(stat -c '%U' "$file" 2>/dev/null)
        if [ "$OWNER" = "root" ] && [ -n "$SERVICE_USER" ] && [ "$SERVICE_USER" != "root" ]; then
            log_warning "$file ainda pertence a root, corrigindo..."
            sudo chown "${SERVICE_USER}:${SERVICE_GROUP}" "$file" 2>/dev/null || log_error "Falha ao corrigir $file"
        fi
    fi
done

# ============ REINICIAR SERVIÇO ============
log_info "Reiniciando serviço..."

# Tentar diferentes nomes de serviço
for service_name in semppre-bridge semppreacs semppreacs2 genieacs-bridge; do
    if systemctl is-enabled "$service_name" &>/dev/null; then
        systemctl restart "$service_name" 2>/dev/null && log_success "Serviço $service_name reiniciado" && break
    fi
done

# Versão final
NEW_VERSION=$(cat VERSION 2>/dev/null || echo "desconhecida")

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Atualização Concluída! ✓                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Versão instalada: $NEW_VERSION"
echo "  Usuário do serviço: ${SERVICE_USER:-não detectado}"
echo ""
echo "  Arquivos preservados:"
echo "    - .env (configurações)"
echo "    - data/users.json (usuários)"
echo "    - data/groups.json (grupos)"
echo "    - data/semppre_acs.db (banco de dados)"
echo ""
echo "  Agora você pode usar o sistema de updates:"
echo "    ./venv/bin/python updater/updater.py check"
echo "    ./venv/bin/python updater/updater.py update"
echo ""
echo "  Ou via interface web:"
echo "    Configurações > Sistema > Atualizações"
echo ""
