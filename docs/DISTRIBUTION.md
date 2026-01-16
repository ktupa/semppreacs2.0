# Sistema de Distribuição e Atualizações - SemPPRE Bridge

Este documento descreve como distribuir e atualizar o SemPPRE Bridge para múltiplos clientes.

## 📋 Visão Geral

O sistema foi projetado para permitir que você mantenha uma **base de código centralizada** e distribua atualizações para múltiplos clientes sem compartilhar banco de dados.

```
┌─────────────────────────────────────────────────────────────────┐
│                    SERVIDOR MASTER (Você)                        │
│                                                                  │
│   ┌──────────────┐    ┌──────────────┐    ┌──────────────┐      │
│   │  Código Base │    │   Releases   │    │    GitHub    │      │
│   │  (app/)      │───>│   (tags)     │───>│   / GitLab   │      │
│   │  (frontend/) │    │   (v1.2.0)   │    │              │      │
│   └──────────────┘    └──────────────┘    └──────────────┘      │
│                                                   │               │
└───────────────────────────────────────────────────│───────────────┘
                                                    │
                                                    │ git pull / API
                                                    ▼
    ┌─────────────────┐  ┌─────────────────┐  ┌─────────────────┐
    │   CLIENTE A     │  │   CLIENTE B     │  │   CLIENTE C     │
    │                 │  │                 │  │                 │
    │ ┌─────────────┐ │  │ ┌─────────────┐ │  │ ┌─────────────┐ │
    │ │ .env (local)│ │  │ │ .env (local)│ │  │ │ .env (local)│ │
    │ │ users.json  │ │  │ │ users.json  │ │  │ │ users.json  │ │
    │ │ MongoDB     │ │  │ │ MongoDB     │ │  │ │ MongoDB     │ │
    │ └─────────────┘ │  │ └─────────────┘ │  │ └─────────────┘ │
    │   Configurações │  │   Configurações │  │   Configurações │
    │   Independentes │  │   Independentes │  │   Independentes │
    └─────────────────┘  └─────────────────┘  └─────────────────┘
```

## 🚀 Fluxo de Trabalho

### 1. Desenvolvimento (No seu servidor master)

```bash
# Desenvolva normalmente
cd /opt/semppre-bridge
# ... faça suas alterações ...

# Commit das mudanças
git add .
git commit -m "feat: nova funcionalidade X"

# Crie uma nova release
git tag v1.2.1
git push origin main --tags
```

### 2. Instalação em Novo Cliente

O cliente pode instalar com um único comando:

```bash
# Via script de instalação
curl -sSL https://seu-servidor/install.sh | sudo bash

# Ou manualmente
git clone https://github.com/seuusuario/semppre-bridge.git /opt/semppre-bridge
cd /opt/semppre-bridge
./updater/client_setup.sh
```

### 3. Atualização de Clientes

**Via linha de comando:**
```bash
cd /opt/semppre-bridge
./venv/bin/python updater/updater.py check   # Verifica atualizações
./venv/bin/python updater/updater.py update  # Aplica atualização
```

**Via API:**
```bash
# Verificar atualizações
curl http://localhost:8087/api/updates/check

# Aplicar atualização
curl -X POST http://localhost:8087/api/updates/apply
```

**Via Interface Web:**
- Acesse Configurações > Sistema > Atualizações
- Clique em "Verificar Atualizações"
- Clique em "Atualizar" se disponível

## 📁 Arquivos Protegidos

Os seguintes arquivos **NÃO são sobrescritos** durante atualizações:

| Arquivo | Descrição |
|---------|-----------|
| `.env` | Configurações do ambiente |
| `data/users.json` | Usuários cadastrados |
| `data/ml/baselines.json` | Baselines de ML do cliente |
| `data/ml/patterns.json` | Padrões aprendidos |
| `data/ml/thresholds.json` | Limiares configurados |

## 🔧 Configuração do Updater

Arquivo: `updater/config.json`

```json
{
  "update_server": {
    "type": "git",
    "repository": "https://github.com/seuusuario/semppre-bridge.git",
    "branch": "main"
  },
  "version": {
    "current": "1.2.0",
    "check_interval_hours": 24,
    "auto_update": false
  },
  "protected_files": [
    ".env",
    "data/users.json"
  ],
  "post_update_commands": [
    "pip install -r requirements.txt --quiet",
    "cd frontend && npm install && npm run build"
  ],
  "services_to_restart": [
    "semppre-bridge"
  ]
}
```

## 🔄 Tipos de Distribuição

### Opção 1: Git (Recomendado para pequena escala)

**Prós:**
- Simples de implementar
- Histórico completo de mudanças
- Rollback fácil

**Contras:**
- Requer acesso Git nos clientes
- Clientes veem código fonte

```bash
# No cliente
git remote add origin https://github.com/seuusuario/semppre-bridge.git
git pull origin main
```

### Opção 2: Releases HTTP (Médio escala)

**Prós:**
- Não expõe código fonte completo
- Clientes baixam apenas releases compiladas
- Checksum de integridade

**Contras:**
- Requer servidor de releases
- Mais complexo de configurar

```json
{
  "update_server": {
    "type": "http",
    "url": "https://releases.seudominio.com/semppre"
  }
}
```

### Opção 3: Docker Registry (Grande escala)

**Prós:**
- Deploy consistente
- Versionamento de imagens
- Fácil escalabilidade

**Contras:**
- Requer infraestrutura Docker
- Mais recursos de servidor

```yaml
# docker-compose.yml do cliente
version: '3.8'
services:
  semppre-bridge:
    image: seu-registry/semppre-bridge:latest
    env_file: .env
    volumes:
      - ./data:/app/data
    ports:
      - "8087:8087"
```

## 📝 Workflow de Release

### Criando uma Nova Release

```bash
# 1. Atualize o CHANGELOG.md
vim CHANGELOG.md

# 2. Atualize a versão
echo "1.2.1" > VERSION

# 3. Commit
git add .
git commit -m "release: v1.2.1"

# 4. Crie a tag
git tag -a v1.2.1 -m "Release 1.2.1 - Nova funcionalidade X"

# 5. Push
git push origin main --tags
```

### Estrutura de Versões

Seguimos [Semantic Versioning](https://semver.org/):

- **MAJOR** (1.x.x): Mudanças incompatíveis
- **MINOR** (x.1.x): Novas funcionalidades compatíveis
- **PATCH** (x.x.1): Correções de bugs

## 🛡️ Segurança

### Repositório Privado

Se você não quer que clientes vejam o código fonte:

1. Use um repositório privado
2. Crie tokens de acesso por cliente
3. Ou use a opção de releases HTTP

```bash
# Clone com token
git clone https://TOKEN@github.com/seuusuario/semppre-bridge.git
```

### Validação de Updates

O sistema verifica:
- ✅ Checksum SHA256 dos arquivos
- ✅ Assinatura de releases (se configurado)
- ✅ Backup automático antes de atualizar
- ✅ Rollback em caso de falha

## 🔍 Monitoramento de Clientes

Para saber quais clientes estão atualizados:

```python
# No seu servidor master, você pode criar um endpoint
# que clientes reportam suas versões

@app.post("/api/telemetry/version")
async def report_version(client_id: str, version: str):
    # Registra versão do cliente
    ...
```

## ❓ FAQ

**P: E se o cliente fizer modificações locais?**
R: Mudanças locais são preservadas via git stash. Recomendamos que clientes NÃO modifiquem código - apenas arquivos de configuração.

**P: Posso ter diferentes versões por cliente?**
R: Sim! Basta especificar a versão no update:
```bash
python updater/updater.py update --version 1.1.0
```

**P: Como faço rollback?**
R: O sistema cria backups automáticos. Para restaurar:
```bash
python updater/updater.py restore backup_1.2.0_20260116_143022.tar.gz
```

**P: Posso customizar o frontend por cliente?**
R: Sim! Crie um arquivo `frontend/src/config/branding.ts` e adicione-o aos `protected_files`. Cada cliente terá sua própria marca.

## 📞 Suporte

Para dúvidas sobre distribuição e atualizações:
- Email: suporte@semppre.com.br
- Docs: https://docs.semppre.com.br
