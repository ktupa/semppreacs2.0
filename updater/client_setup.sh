#!/bin/bash
#
# SemPPRE Bridge - Script de Instalação para Novos Clientes
# 
# Uso: curl -sSL https://seu-servidor/install.sh | bash
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

INSTALL_DIR="/opt/semppre-bridge"
REPO_URL="${SEMPPRE_REPO:-https://github.com/seuusuario/semppre-bridge.git}"
BRANCH="${SEMPPRE_BRANCH:-main}"

echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║         SemPPRE Bridge - Instalação de Cliente             ║"
echo "║            Sistema ACS TR-069 Management                   ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""

# Verificar se é root
if [[ $EUID -ne 0 ]]; then
    log_error "Este script deve ser executado como root"
    exit 1
fi

# Verificar dependências
log_info "Verificando dependências..."

check_dependency() {
    if ! command -v $1 &> /dev/null; then
        log_warning "$1 não encontrado. Instalando..."
        return 1
    fi
    return 0
}

# Instalar dependências base
apt-get update -qq

if ! check_dependency git; then
    apt-get install -y git
fi

if ! check_dependency python3; then
    apt-get install -y python3 python3-pip python3-venv
fi

if ! check_dependency node; then
    log_info "Instalando Node.js..."
    curl -fsSL https://deb.nodesource.com/setup_20.x | bash -
    apt-get install -y nodejs
fi

log_success "Dependências verificadas"

# Clonar repositório
if [ -d "$INSTALL_DIR" ]; then
    log_warning "Diretório $INSTALL_DIR já existe"
    read -p "Deseja sobrescrever? (y/N) " -n 1 -r
    echo
    if [[ $REPLY =~ ^[Yy]$ ]]; then
        rm -rf "$INSTALL_DIR"
    else
        log_error "Instalação cancelada"
        exit 1
    fi
fi

log_info "Clonando repositório..."
git clone --branch "$BRANCH" "$REPO_URL" "$INSTALL_DIR"
cd "$INSTALL_DIR"

log_success "Repositório clonado"

# Configurar ambiente Python
log_info "Configurando ambiente Python..."
python3 -m venv venv
source venv/bin/activate
pip install --upgrade pip -q
pip install -r requirements.txt -q

log_success "Ambiente Python configurado"

# Configurar Frontend
log_info "Configurando Frontend..."
cd frontend
npm install --silent
npm run build

cd ..
log_success "Frontend configurado"

# Criar arquivo .env se não existir
if [ ! -f ".env" ]; then
    log_info "Criando arquivo de configuração .env..."
    cat > .env << 'EOF'
# ==============================================
# SemPPRE Bridge - Configuração do Cliente
# ==============================================

# Servidor
BRIDGE_HOST=0.0.0.0
BRIDGE_PORT=8087
BRIDGE_DEBUG=false

# GenieACS
GENIE_NBI=http://127.0.0.1:7557
GENIE_FS=http://127.0.0.1:7567
GENIE_CWMP=http://127.0.0.1:7547
GENIE_UI=http://127.0.0.1:3000

# Autenticação CWMP
GENIE_CWMP_AUTH=true
GENIE_CWMP_USERNAME=admin
GENIE_CWMP_PASSWORD=admin

# IXC (configurar se usar integração)
# IXC_BASE_URL=https://seu-ixc.com.br/webservice/v1
# IXC_TOKEN_BASIC=id:token

# Mobile API
MOBILE_API_TOKEN=$(openssl rand -hex 32)

# Atualizações
AUTO_UPDATE=false
UPDATE_CHECK_INTERVAL=24
EOF

    log_success "Arquivo .env criado"
    log_warning "IMPORTANTE: Edite o arquivo .env com suas configurações!"
fi

# Criar diretórios necessários
mkdir -p logs
mkdir -p data/backups
mkdir -p updater/backups

# Criar arquivo VERSION
cat > VERSION << EOF
1.2.0
EOF

# Criar serviço systemd
log_info "Criando serviço systemd..."
cat > /etc/systemd/system/semppre-bridge.service << EOF
[Unit]
Description=SemPPRE Bridge ACS
After=network.target mongodb.service

[Service]
Type=simple
User=root
WorkingDirectory=$INSTALL_DIR
Environment=PATH=$INSTALL_DIR/venv/bin:/usr/local/bin:/usr/bin:/bin
ExecStart=$INSTALL_DIR/venv/bin/python -m uvicorn app.main:app --host 0.0.0.0 --port 8087
Restart=always
RestartSec=10

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
log_success "Serviço systemd criado"

# Configurar cron para verificação de atualizações
log_info "Configurando verificação automática de atualizações..."
cat > /etc/cron.d/semppre-update-check << EOF
# Verificar atualizações do SemPPRE Bridge diariamente às 3:00
0 3 * * * root cd $INSTALL_DIR && ./venv/bin/python updater/updater.py check >> /var/log/semppre-update.log 2>&1
EOF

log_success "Cron configurado"

# Resumo final
echo ""
echo "╔════════════════════════════════════════════════════════════╗"
echo "║              Instalação Concluída com Sucesso!             ║"
echo "╚════════════════════════════════════════════════════════════╝"
echo ""
echo "Próximos passos:"
echo ""
echo "  1. Configure o arquivo .env:"
echo "     ${YELLOW}nano $INSTALL_DIR/.env${NC}"
echo ""
echo "  2. Inicie o serviço:"
echo "     ${GREEN}systemctl start semppre-bridge${NC}"
echo "     ${GREEN}systemctl enable semppre-bridge${NC}"
echo ""
echo "  3. Verifique o status:"
echo "     ${BLUE}systemctl status semppre-bridge${NC}"
echo ""
echo "  4. Comandos de atualização:"
echo "     ${BLUE}cd $INSTALL_DIR${NC}"
echo "     ${BLUE}./venv/bin/python updater/updater.py check${NC}  - Verificar atualizações"
echo "     ${BLUE}./venv/bin/python updater/updater.py update${NC} - Atualizar sistema"
echo ""
echo "  Acesso: http://localhost:8087"
echo ""
