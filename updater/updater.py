#!/usr/bin/env python3
"""
SemPPRE Bridge - Sistema de Atualização Automática
Permite atualizar clientes sem compartilhar banco de dados
"""

import os
import sys
import json
import shutil
import subprocess
import logging
from datetime import datetime
from pathlib import Path
from typing import Optional, List, Dict, Any
import hashlib
import tarfile
import tempfile

# Configuração de logging
logging.basicConfig(
    level=logging.INFO,
    format='%(asctime)s - %(levelname)s - %(message)s',
    handlers=[
        logging.StreamHandler(),
        logging.FileHandler('/opt/semppre-bridge/logs/updater.log')
    ]
)
logger = logging.getLogger(__name__)

BASE_DIR = Path('/opt/semppre-bridge')
CONFIG_FILE = BASE_DIR / 'updater' / 'config.json'
BACKUP_DIR = BASE_DIR / 'updater' / 'backups'
VERSION_FILE = BASE_DIR / 'VERSION'


class SemPPREUpdater:
    """Sistema de atualização para instâncias cliente do ACSMAN"""
    
    def __init__(self):
        self.config = self._load_config()
        self.current_version = self._get_current_version()
        BACKUP_DIR.mkdir(parents=True, exist_ok=True)
        
    def _load_config(self) -> Dict[str, Any]:
        """Carrega configuração do updater"""
        if CONFIG_FILE.exists():
            with open(CONFIG_FILE) as f:
                return json.load(f)
        return {}
    
    def _save_config(self):
        """Salva configuração atualizada"""
        with open(CONFIG_FILE, 'w') as f:
            json.dump(self.config, f, indent=2)
    
    def _get_current_version(self) -> str:
        """Obtém versão atual instalada"""
        if VERSION_FILE.exists():
            return VERSION_FILE.read_text().strip()
        return self.config.get('version', {}).get('current', '0.0.0')
    
    def _run_command(self, cmd: str, cwd: Optional[str] = None) -> tuple[bool, str]:
        """Executa comando shell e retorna sucesso e output"""
        try:
            result = subprocess.run(
                cmd,
                shell=True,
                cwd=cwd or str(BASE_DIR),
                capture_output=True,
                text=True,
                timeout=300
            )
            return result.returncode == 0, result.stdout + result.stderr
        except subprocess.TimeoutExpired:
            return False, "Timeout ao executar comando"
        except Exception as e:
            return False, str(e)
    
    def check_for_updates(self) -> Optional[Dict[str, Any]]:
        """Verifica se há atualizações disponíveis"""
        logger.info("Verificando atualizações...")
        
        update_type = self.config.get('update_server', {}).get('type', 'git')
        
        if update_type == 'git':
            return self._check_git_updates()
        elif update_type == 'http':
            return self._check_http_updates()
        
        return None
    
    def _check_git_updates(self) -> Optional[Dict[str, Any]]:
        """Verifica atualizações via Git"""
        # Fetch das atualizações
        success, _ = self._run_command('git fetch origin --tags')
        if not success:
            logger.error("Falha ao buscar atualizações do Git")
            return None
        
        # Obtém última tag
        success, output = self._run_command('git describe --tags --abbrev=0 origin/main 2>/dev/null || echo ""')
        if not success or not output.strip():
            # Se não há tags, verifica commits
            success, output = self._run_command('git rev-parse origin/main')
            if success:
                remote_hash = output.strip()[:8]
                success, local_output = self._run_command('git rev-parse HEAD')
                local_hash = local_output.strip()[:8] if success else ""
                
                if remote_hash != local_hash:
                    return {
                        'available': True,
                        'current_version': self.current_version,
                        'new_version': f'commit-{remote_hash}',
                        'type': 'commit'
                    }
            return None
        
        latest_tag = output.strip()
        if latest_tag and self._compare_versions(latest_tag, self.current_version) > 0:
            # Obtém changelog
            changelog = self._get_changelog(self.current_version, latest_tag)
            return {
                'available': True,
                'current_version': self.current_version,
                'new_version': latest_tag,
                'changelog': changelog,
                'type': 'release'
            }
        
        return {'available': False, 'current_version': self.current_version}
    
    def _check_http_updates(self) -> Optional[Dict[str, Any]]:
        """Verifica atualizações via HTTP (servidor de releases)"""
        import urllib.request
        
        server_url = self.config.get('update_server', {}).get('url', '')
        if not server_url:
            return None
        
        try:
            with urllib.request.urlopen(f"{server_url}/latest.json", timeout=10) as response:
                data = json.loads(response.read().decode())
                if self._compare_versions(data['version'], self.current_version) > 0:
                    return {
                        'available': True,
                        'current_version': self.current_version,
                        'new_version': data['version'],
                        'download_url': data.get('download_url'),
                        'changelog': data.get('changelog', []),
                        'checksum': data.get('checksum')
                    }
        except Exception as e:
            logger.error(f"Erro ao verificar atualizações HTTP: {e}")
        
        return {'available': False, 'current_version': self.current_version}
    
    def _compare_versions(self, v1: str, v2: str) -> int:
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
    
    def _get_changelog(self, from_version: str, to_version: str) -> List[str]:
        """Obtém changelog entre versões"""
        success, output = self._run_command(
            f'git log --oneline v{from_version}..v{to_version} 2>/dev/null || '
            f'git log --oneline {from_version}..{to_version} 2>/dev/null || echo ""'
        )
        if success and output.strip():
            return output.strip().split('\n')
        return []
    
    def create_backup(self) -> Optional[str]:
        """Cria backup antes da atualização"""
        timestamp = datetime.now().strftime('%Y%m%d_%H%M%S')
        backup_name = f'backup_{self.current_version}_{timestamp}'
        backup_path = BACKUP_DIR / f'{backup_name}.tar.gz'
        
        logger.info(f"Criando backup: {backup_path}")
        
        try:
            with tarfile.open(backup_path, 'w:gz') as tar:
                # Backup do código (exceto arquivos protegidos e pastas grandes)
                for item in BASE_DIR.iterdir():
                    if item.name in ['.git', '.venv', 'venv', 'node_modules', 'updater']:
                        continue
                    if item.name == 'data':
                        # Backup apenas de configs, não de dados grandes
                        continue
                    tar.add(item, arcname=item.name)
                
                # Backup dos arquivos protegidos separadamente
                for protected in self.config.get('protected_files', []):
                    pfile = BASE_DIR / protected
                    if pfile.exists():
                        tar.add(pfile, arcname=f'_protected_/{protected}')
            
            logger.info(f"Backup criado com sucesso: {backup_path}")
            return str(backup_path)
        except Exception as e:
            logger.error(f"Erro ao criar backup: {e}")
            return None
    
    def restore_backup(self, backup_path: str) -> bool:
        """Restaura um backup anterior"""
        logger.info(f"Restaurando backup: {backup_path}")
        
        if not Path(backup_path).exists():
            logger.error("Arquivo de backup não encontrado")
            return False
        
        try:
            with tempfile.TemporaryDirectory() as tmpdir:
                # Extrai backup
                with tarfile.open(backup_path, 'r:gz') as tar:
                    tar.extractall(tmpdir)
                
                # Restaura arquivos (exceto protegidos)
                for item in Path(tmpdir).iterdir():
                    if item.name == '_protected_':
                        continue
                    dest = BASE_DIR / item.name
                    if dest.exists():
                        if dest.is_dir():
                            shutil.rmtree(dest)
                        else:
                            dest.unlink()
                    shutil.move(str(item), str(dest))
            
            logger.info("Backup restaurado com sucesso")
            return True
        except Exception as e:
            logger.error(f"Erro ao restaurar backup: {e}")
            return False
    
    def update(self, target_version: Optional[str] = None) -> bool:
        """Executa a atualização"""
        logger.info("=" * 50)
        logger.info("Iniciando processo de atualização")
        logger.info("=" * 50)
        
        # 1. Verificar atualizações
        update_info = self.check_for_updates()
        if not update_info or not update_info.get('available'):
            logger.info("Sistema já está na versão mais recente")
            return True
        
        new_version = target_version or update_info.get('new_version')
        logger.info(f"Atualizando de {self.current_version} para {new_version}")
        
        # 2. Criar backup
        backup_path = self.create_backup()
        if not backup_path:
            logger.error("Falha ao criar backup. Abortando atualização.")
            return False
        
        # 3. Salvar arquivos protegidos
        protected_files = self._save_protected_files()
        
        try:
            # 4. Executar atualização
            if self.config.get('update_server', {}).get('type') == 'git':
                success = self._update_via_git(new_version)
            else:
                success = self._update_via_http(update_info)
            
            if not success:
                raise Exception("Falha na atualização")
            
            # 5. Restaurar arquivos protegidos
            self._restore_protected_files(protected_files)
            
            # 6. Executar comandos pós-atualização
            self._run_post_update_commands()
            
            # 7. Atualizar versão
            self._update_version(new_version)
            
            # 8. Reiniciar serviços
            self._restart_services()
            
            logger.info("=" * 50)
            logger.info(f"Atualização concluída com sucesso! v{new_version}")
            logger.info("=" * 50)
            return True
            
        except Exception as e:
            logger.error(f"Erro durante atualização: {e}")
            logger.info("Iniciando rollback...")
            
            if self.restore_backup(backup_path):
                logger.info("Rollback concluído")
            else:
                logger.error("CRÍTICO: Falha no rollback!")
            
            return False
    
    def _save_protected_files(self) -> Dict[str, bytes]:
        """Salva conteúdo dos arquivos protegidos em memória"""
        protected = {}
        for filepath in self.config.get('protected_files', []):
            full_path = BASE_DIR / filepath
            if full_path.exists():
                protected[filepath] = full_path.read_bytes()
                logger.debug(f"Arquivo protegido salvo: {filepath}")
        return protected
    
    def _restore_protected_files(self, protected: Dict[str, bytes]):
        """Restaura arquivos protegidos"""
        for filepath, content in protected.items():
            full_path = BASE_DIR / filepath
            full_path.parent.mkdir(parents=True, exist_ok=True)
            full_path.write_bytes(content)
            logger.debug(f"Arquivo protegido restaurado: {filepath}")
    
    def _update_via_git(self, version: str) -> bool:
        """Atualiza via Git"""
        # Stash de mudanças locais
        self._run_command('git stash')
        
        # Pull das mudanças
        if version.startswith('commit-'):
            # Atualização por commit
            success, output = self._run_command('git pull origin main')
        else:
            # Atualização por tag/versão
            success, output = self._run_command(f'git checkout tags/v{version} -B main 2>/dev/null || git checkout tags/{version} -B main')
        
        if not success:
            logger.error(f"Erro no git: {output}")
            return False
        
        logger.info("Código atualizado via Git")
        return True
    
    def _update_via_http(self, update_info: Dict) -> bool:
        """Atualiza via download HTTP"""
        import urllib.request
        
        download_url = update_info.get('download_url')
        if not download_url:
            return False
        
        try:
            # Download do pacote
            with tempfile.NamedTemporaryFile(suffix='.tar.gz', delete=False) as tmp:
                urllib.request.urlretrieve(download_url, tmp.name)
                
                # Verificar checksum se disponível
                if update_info.get('checksum'):
                    with open(tmp.name, 'rb') as f:
                        file_hash = hashlib.sha256(f.read()).hexdigest()
                    if file_hash != update_info['checksum']:
                        logger.error("Checksum inválido!")
                        return False
                
                # Extrair atualização
                with tarfile.open(tmp.name, 'r:gz') as tar:
                    tar.extractall(str(BASE_DIR))
            
            return True
        except Exception as e:
            logger.error(f"Erro no download: {e}")
            return False
    
    def _run_post_update_commands(self):
        """Executa comandos pós-atualização"""
        logger.info("Executando comandos pós-atualização...")
        
        for cmd in self.config.get('post_update_commands', []):
            logger.info(f"Executando: {cmd}")
            success, output = self._run_command(cmd)
            if not success:
                logger.warning(f"Comando falhou: {output}")
    
    def _update_version(self, version: str):
        """Atualiza arquivo de versão"""
        VERSION_FILE.write_text(version.lstrip('v'))
        self.config['version']['current'] = version.lstrip('v')
        self._save_config()
    
    def _restart_services(self):
        """Reinicia serviços configurados"""
        for service in self.config.get('services_to_restart', []):
            logger.info(f"Reiniciando serviço: {service}")
            self._run_command(f'systemctl restart {service} 2>/dev/null || true')
    
    def list_backups(self) -> List[Dict[str, Any]]:
        """Lista backups disponíveis"""
        backups = []
        for backup_file in BACKUP_DIR.glob('backup_*.tar.gz'):
            stat = backup_file.stat()
            backups.append({
                'name': backup_file.name,
                'path': str(backup_file),
                'size_mb': round(stat.st_size / (1024 * 1024), 2),
                'created': datetime.fromtimestamp(stat.st_mtime).isoformat()
            })
        return sorted(backups, key=lambda x: x['created'], reverse=True)
    
    def cleanup_old_backups(self, keep: int = 5):
        """Remove backups antigos, mantendo os N mais recentes"""
        backups = self.list_backups()
        for backup in backups[keep:]:
            Path(backup['path']).unlink()
            logger.info(f"Backup removido: {backup['name']}")


def main():
    """CLI do updater"""
    import argparse
    
    parser = argparse.ArgumentParser(description='SemPPRE Bridge Updater')
    subparsers = parser.add_subparsers(dest='command', help='Comandos disponíveis')
    
    # Comando: check
    subparsers.add_parser('check', help='Verifica atualizações disponíveis')
    
    # Comando: update
    update_parser = subparsers.add_parser('update', help='Executa atualização')
    update_parser.add_argument('--version', '-v', help='Versão específica para atualizar')
    update_parser.add_argument('--force', '-f', action='store_true', help='Forçar atualização')
    
    # Comando: backup
    subparsers.add_parser('backup', help='Cria backup manual')
    
    # Comando: restore
    restore_parser = subparsers.add_parser('restore', help='Restaura um backup')
    restore_parser.add_argument('backup_file', help='Arquivo de backup para restaurar')
    
    # Comando: list-backups
    subparsers.add_parser('list-backups', help='Lista backups disponíveis')
    
    # Comando: version
    subparsers.add_parser('version', help='Mostra versão atual')
    
    args = parser.parse_args()
    
    # Criar diretório de logs se não existir
    (BASE_DIR / 'logs').mkdir(exist_ok=True)
    
    updater = SemPPREUpdater()
    
    if args.command == 'check':
        result = updater.check_for_updates()
        if result:
            print(json.dumps(result, indent=2))
            if result.get('available'):
                print(f"\n✨ Nova versão disponível: {result['new_version']}")
                if result.get('changelog'):
                    print("\nChangelog:")
                    for line in result['changelog'][:10]:
                        print(f"  - {line}")
            else:
                print("\n✅ Sistema está atualizado!")
    
    elif args.command == 'update':
        success = updater.update(args.version)
        sys.exit(0 if success else 1)
    
    elif args.command == 'backup':
        backup_path = updater.create_backup()
        if backup_path:
            print(f"✅ Backup criado: {backup_path}")
        else:
            print("❌ Falha ao criar backup")
            sys.exit(1)
    
    elif args.command == 'restore':
        success = updater.restore_backup(args.backup_file)
        sys.exit(0 if success else 1)
    
    elif args.command == 'list-backups':
        backups = updater.list_backups()
        if backups:
            print("\nBackups disponíveis:")
            print("-" * 60)
            for b in backups:
                print(f"  {b['name']} ({b['size_mb']} MB) - {b['created']}")
        else:
            print("Nenhum backup encontrado")
    
    elif args.command == 'version':
        print(f"SemPPRE Bridge v{updater.current_version}")
    
    else:
        parser.print_help()


if __name__ == '__main__':
    main()
