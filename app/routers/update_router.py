# app/routers/update_router.py
"""
Router para gerenciamento de atualizações do sistema
Permite verificar, aplicar e gerenciar atualizações via API
"""

from fastapi import APIRouter, HTTPException, BackgroundTasks
from pydantic import BaseModel
from typing import Optional, List
import subprocess
import json
from pathlib import Path
from datetime import datetime

router = APIRouter(prefix="/api/updates", tags=["updates"])

BASE_DIR = Path('/opt/semppre-bridge')
UPDATER_SCRIPT = BASE_DIR / 'updater' / 'updater.py'
VERSION_FILE = BASE_DIR / 'VERSION'
CONFIG_FILE = BASE_DIR / 'updater' / 'config.json'
PYTHON_PATH = BASE_DIR / 'venv' / 'bin' / 'python'


class UpdateStatus(BaseModel):
    available: bool
    current_version: str
    new_version: Optional[str] = None
    changelog: Optional[List[str]] = None
    last_check: Optional[str] = None


class BackupInfo(BaseModel):
    name: str
    path: str
    size_mb: float
    created: str


class UpdateConfig(BaseModel):
    auto_update: bool = False
    check_interval_hours: int = 24


def _get_current_version() -> str:
    """Obtém versão atual do sistema"""
    if VERSION_FILE.exists():
        return VERSION_FILE.read_text().strip()
    return "unknown"


def _compare_versions(v1: str, v2: str) -> int:
    """Compara duas versões. Retorna: 1 se v1 > v2, -1 se v1 < v2, 0 se iguais"""
    def normalize(v):
        v = v.lstrip('v')
        return [int(x) for x in v.split('.') if x.isdigit()]
    
    try:
        n1, n2 = normalize(v1), normalize(v2)
        for a, b in zip(n1, n2):
            if a > b: return 1
            if a < b: return -1
        return len(n1) - len(n2)
    except:
        return 0


def _check_git_updates() -> dict:
    """Verifica atualizações via Git diretamente"""
    current_version = _get_current_version()
    
    try:
        # Fetch das atualizações
        subprocess.run(
            ['git', 'fetch', 'origin', '--tags'],
            cwd=str(BASE_DIR),
            capture_output=True,
            timeout=30
        )
        
        # Obtém última tag
        result = subprocess.run(
            ['git', 'describe', '--tags', '--abbrev=0', 'origin/main'],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=10
        )
        
        if result.returncode == 0 and result.stdout.strip():
            latest_tag = result.stdout.strip()
            
            if _compare_versions(latest_tag, current_version) > 0:
                # Obtém changelog
                changelog_result = subprocess.run(
                    ['git', 'log', '--oneline', f'{current_version}..{latest_tag}'],
                    cwd=str(BASE_DIR),
                    capture_output=True,
                    text=True,
                    timeout=10
                )
                changelog = changelog_result.stdout.strip().split('\n') if changelog_result.stdout.strip() else []
                
                return {
                    'available': True,
                    'current_version': current_version,
                    'new_version': latest_tag,
                    'changelog': changelog[:10],  # Limita a 10 entradas
                    'type': 'release'
                }
        
        return {
            'available': False,
            'current_version': current_version
        }
        
    except Exception as e:
        return {
            'available': False,
            'current_version': current_version,
            'error': str(e)
        }


def _run_updater(command: str) -> dict:
    """Executa comando do updater e retorna resultado"""
    try:
        python_exec = str(PYTHON_PATH) if PYTHON_PATH.exists() else 'python3'
        result = subprocess.run(
            [python_exec, str(UPDATER_SCRIPT), command],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True,
            timeout=120
        )
        return {'output': result.stdout, 'error': result.stderr if result.returncode != 0 else None}
    except subprocess.TimeoutExpired:
        return {'error': 'Timeout ao executar comando'}
    except Exception as e:
        return {'error': str(e)}


@router.get("/version")
async def get_version():
    """Retorna versão atual do sistema"""
    return {
        "version": _get_current_version(),
        "app_name": "AcsMan",
        "build_date": datetime.now().isoformat()
    }


@router.get("/check", response_model=UpdateStatus)
async def check_updates():
    """Verifica se há atualizações disponíveis"""
    result = _check_git_updates()
    
    return UpdateStatus(
        available=result.get('available', False),
        current_version=_get_current_version(),
        new_version=result.get('new_version'),
        changelog=result.get('changelog', []),
        last_check=datetime.now().isoformat()
    )


@router.post("/apply")
async def apply_update(background_tasks: BackgroundTasks, version: Optional[str] = None):
    """
    Inicia processo de atualização
    A atualização roda em background para não bloquear a API
    """
    def run_update():
        cmd = ['python3', str(UPDATER_SCRIPT), 'update']
        if version:
            cmd.extend(['--version', version])
        subprocess.run(cmd, cwd=str(BASE_DIR))
    
    background_tasks.add_task(run_update)
    
    return {
        "status": "started",
        "message": "Atualização iniciada em background. O serviço será reiniciado automaticamente.",
        "target_version": version or "latest"
    }


@router.get("/backups", response_model=List[BackupInfo])
async def list_backups():
    """Lista todos os backups disponíveis"""
    backup_dir = BASE_DIR / 'updater' / 'backups'
    backups = []
    
    if backup_dir.exists():
        for backup_file in backup_dir.glob('backup_*.tar.gz'):
            stat = backup_file.stat()
            backups.append(BackupInfo(
                name=backup_file.name,
                path=str(backup_file),
                size_mb=round(stat.st_size / (1024 * 1024), 2),
                created=datetime.fromtimestamp(stat.st_mtime).isoformat()
            ))
    
    return sorted(backups, key=lambda x: x.created, reverse=True)


@router.post("/backup")
async def create_backup(background_tasks: BackgroundTasks):
    """Cria um backup manual do sistema em background"""
    import tarfile
    from datetime import datetime
    
    backup_dir = BASE_DIR / 'updater' / 'backups'
    backup_dir.mkdir(parents=True, exist_ok=True)
    
    timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
    current_version = _get_current_version()
    backup_name = f'backup_{current_version}_{timestamp}.tar.gz'
    backup_path = backup_dir / backup_name
    
    def do_backup():
        try:
            with tarfile.open(backup_path, 'w:gz') as tar:
                # Backup do código principal
                for folder in ['app', 'frontend/src', 'frontend/public']:
                    folder_path = BASE_DIR / folder
                    if folder_path.exists():
                        tar.add(folder_path, arcname=folder)
                
                # Backup de arquivos importantes
                for file in ['requirements.txt', 'VERSION', 'CHANGELOG.md']:
                    file_path = BASE_DIR / file
                    if file_path.exists():
                        tar.add(file_path, arcname=file)
        except Exception as e:
            print(f"Erro ao criar backup: {e}")
    
    background_tasks.add_task(do_backup)
    
    return {
        "status": "started",
        "message": f"Backup {backup_name} sendo criado em background",
        "backup_name": backup_name
    }


@router.post("/restore/{backup_name}")
async def restore_backup(backup_name: str, background_tasks: BackgroundTasks):
    """Restaura um backup específico"""
    backup_path = BASE_DIR / 'updater' / 'backups' / backup_name
    
    if not backup_path.exists():
        raise HTTPException(status_code=404, detail="Backup não encontrado")
    
    def run_restore():
        subprocess.run(
            ['python3', str(UPDATER_SCRIPT), 'restore', str(backup_path)],
            cwd=str(BASE_DIR)
        )
    
    background_tasks.add_task(run_restore)
    
    return {
        "status": "started",
        "message": "Restauração iniciada. O serviço será reiniciado."
    }


@router.get("/config")
async def get_update_config():
    """Retorna configuração atual do updater"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            config = json.load(f)
        return {
            "auto_update": config.get('version', {}).get('auto_update', False),
            "check_interval_hours": config.get('version', {}).get('check_interval_hours', 24),
            "update_server": config.get('update_server', {}),
            "protected_files": config.get('protected_files', [])
        }
    return {}


@router.put("/config")
async def update_config(config: UpdateConfig):
    """Atualiza configuração do updater"""
    if CONFIG_FILE.exists():
        with open(CONFIG_FILE) as f:
            current_config = json.load(f)
    else:
        current_config = {}
    
    if 'version' not in current_config:
        current_config['version'] = {}
    
    current_config['version']['auto_update'] = config.auto_update
    current_config['version']['check_interval_hours'] = config.check_interval_hours
    
    with open(CONFIG_FILE, 'w') as f:
        json.dump(current_config, f, indent=2)
    
    return {"status": "success", "config": config}


@router.get("/changelog")
async def get_changelog():
    """Retorna changelog das últimas versões"""
    changelog_file = BASE_DIR / 'CHANGELOG.md'
    
    if changelog_file.exists():
        return {"changelog": changelog_file.read_text()}
    
    # Tenta obter do git
    try:
        result = subprocess.run(
            ['git', 'log', '--oneline', '-20'],
            cwd=str(BASE_DIR),
            capture_output=True,
            text=True
        )
        commits = result.stdout.strip().split('\n') if result.stdout else []
        return {"commits": commits}
    except:
        return {"changelog": "Changelog não disponível"}
