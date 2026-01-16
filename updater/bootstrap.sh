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

# Verificar se é um repositório git
if [ ! -d ".git" ]; then
    log_error "Não é um repositório Git!"
    log_info "Inicializando repositório Git..."
    
    git init
    git remote add origin https://github.com/ktupa/semppreacs2.0.git
fi

# Salvar arquivos locais importantes
log_info "Salvando configurações locais..."

# Backup do .env
if [ -f ".env" ]; then
    cp .env .env.backup
    log_success ".env salvo"
fi

# Backup do users.json
if [ -f "data/users.json" ]; then
    cp data/users.json data/users.json.backup
    log_success "users.json salvo"
fi

# Fazer fetch e pull
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

# Restaurar arquivos locais
log_info "Restaurando configurações locais..."

if [ -f ".env.backup" ]; then
    mv .env.backup .env
    log_success ".env restaurado"
fi

if [ -f "data/users.json.backup" ]; then
    mv data/users.json.backup data/users.json
    log_success "users.json restaurado"
fi

# Criar diretórios necessários
mkdir -p logs
mkdir -p updater/backups
mkdir -p data/backups

# Atualizar permissões
chmod +x updater/*.sh updater/*.py 2>/dev/null || true

# Atualizar dependências Python
log_info "Atualizando dependências Python..."
if [ -d "venv" ]; then
    ./venv/bin/pip install -r requirements.txt -q
elif [ -d ".venv" ]; then
    ./.venv/bin/pip install -r requirements.txt -q
fi

# Atualizar Frontend
log_info "Atualizando Frontend..."
if [ -d "frontend" ]; then
    cd frontend
    npm install --silent 2>/dev/null || log_warning "npm install falhou (pode ser ok se não tiver node)"
    npm run build 2>/dev/null || log_warning "build falhou"
    cd ..
fi

# Atualizar versão local
if [ -n "$LATEST_TAG" ]; then
    echo "${LATEST_TAG#v}" > VERSION
fi

# Reiniciar serviço
log_info "Reiniciando serviço..."
systemctl restart semppre-bridge 2>/dev/null || log_warning "Não foi possível reiniciar o serviço automaticamente"

# Versão final
NEW_VERSION=$(cat VERSION 2>/dev/null || echo "desconhecida")

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Atualização Concluída! ✓                      ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "  Versão instalada: $NEW_VERSION"
echo ""
echo "  Agora você pode usar o sistema de updates:"
echo "    ./venv/bin/python updater/updater.py check"
echo "    ./venv/bin/python updater/updater.py update"
echo ""
echo "  Ou via interface web:"
echo "    Configurações > Sistema > Atualizações"
echo ""
