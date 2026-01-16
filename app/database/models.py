# app/database/models.py
# Modelos SQLAlchemy para persistência de dados ACS

from datetime import datetime
from typing import Optional, List
from sqlalchemy import (
    Column, Integer, String, Float, Boolean, DateTime, Text, JSON,
    ForeignKey, Index, UniqueConstraint
)
from sqlalchemy.orm import declarative_base, relationship

Base = declarative_base()


class Device(Base):
    """
    Dispositivo CPE - cache local dos dados do GenieACS.
    Sincronizado periodicamente.
    """
    __tablename__ = "devices"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(String(255), unique=True, nullable=False, index=True)  # _id do GenieACS
    serial_number = Column(String(100), index=True)
    manufacturer = Column(String(100))
    product_class = Column(String(100))  # modelo
    oui = Column(String(20))
    
    # Identificação do cliente
    pppoe_login = Column(String(100), index=True)
    ixc_cliente_id = Column(Integer, index=True)
    tag = Column(String(100))
    
    # Status
    is_online = Column(Boolean, default=False)
    last_inform = Column(DateTime)
    last_sync = Column(DateTime, default=datetime.utcnow)
    
    # Dados de conexão
    wan_ip = Column(String(45))  # IPv4 ou IPv6
    wan_mac = Column(String(17))
    connection_type = Column(String(20))  # PPPoE, IPoE, Bridge
    
    # WiFi
    ssid_24ghz = Column(String(64))
    ssid_5ghz = Column(String(64))
    wifi_enabled = Column(Boolean, default=True)
    
    # Firmware
    firmware_version = Column(String(100))
    hardware_version = Column(String(100))
    
    # Dados extras (JSON flexível)
    extra_data = Column(JSON, default=dict)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamentos
    metrics = relationship("DeviceMetric", back_populates="device", cascade="all, delete-orphan")
    diagnostics = relationship("DiagnosticLog", back_populates="device", cascade="all, delete-orphan")
    wifi_snapshots = relationship("WifiSnapshot", back_populates="device", cascade="all, delete-orphan")
    sessions = relationship("ClientSession", back_populates="device", cascade="all, delete-orphan")
    alerts = relationship("AlertEvent", back_populates="device", cascade="all, delete-orphan")
    tasks = relationship("TaskHistory", back_populates="device", cascade="all, delete-orphan")
    
    def __repr__(self):
        return f"<Device {self.device_id} ({self.manufacturer} {self.product_class})>"


class DeviceMetric(Base):
    """
    Métricas coletadas periodicamente de cada dispositivo.
    Usadas para gráficos, tendências e análise ML.
    """
    __tablename__ = "device_metrics"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Timestamp da coleta
    collected_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Métricas de rede
    bytes_received = Column(Float, default=0)
    bytes_sent = Column(Float, default=0)
    packets_received = Column(Integer, default=0)
    packets_sent = Column(Integer, default=0)
    errors_received = Column(Integer, default=0)
    errors_sent = Column(Integer, default=0)
    
    # Latência (ping)
    ping_latency_ms = Column(Float)
    ping_jitter_ms = Column(Float)
    ping_packet_loss = Column(Float)  # percentual
    
    # WiFi
    wifi_clients_24ghz = Column(Integer, default=0)
    wifi_clients_5ghz = Column(Integer, default=0)
    channel_24ghz = Column(Integer)
    channel_5ghz = Column(Integer)
    noise_24ghz = Column(Integer)  # dBm
    noise_5ghz = Column(Integer)  # dBm
    
    # Sistema
    cpu_usage = Column(Float)  # percentual
    memory_usage = Column(Float)  # percentual
    uptime_seconds = Column(Integer)
    
    # LAN
    lan_clients = Column(Integer, default=0)
    
    # Extras
    extra_metrics = Column(JSON, default=dict)
    
    # Relacionamento
    device = relationship("Device", back_populates="metrics")
    
    __table_args__ = (
        Index("ix_device_metrics_device_time", "device_id", "collected_at"),
    )
    
    def __repr__(self):
        return f"<DeviceMetric device={self.device_id} at {self.collected_at}>"


class DiagnosticLog(Base):
    """
    Log de diagnósticos executados (ping, traceroute, speedtest).
    """
    __tablename__ = "diagnostic_logs"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Tipo de diagnóstico
    diagnostic_type = Column(String(50), nullable=False, index=True)  # ping, traceroute, speedtest, iperf
    
    # Parâmetros
    target_host = Column(String(255))
    parameters = Column(JSON, default=dict)
    
    # Resultado
    status = Column(String(20), default="pending")  # pending, running, success, failed, timeout
    result = Column(JSON, default=dict)
    stdout = Column(Text)
    stderr = Column(Text)
    duration_ms = Column(Integer)
    
    # Métricas extraídas (para facilitar queries)
    avg_latency_ms = Column(Float)
    min_latency_ms = Column(Float)
    max_latency_ms = Column(Float)
    packet_loss = Column(Float)
    download_mbps = Column(Float)
    upload_mbps = Column(Float)
    
    # Timestamps
    started_at = Column(DateTime, default=datetime.utcnow)
    completed_at = Column(DateTime)
    
    # Relacionamento
    device = relationship("Device", back_populates="diagnostics")
    
    __table_args__ = (
        Index("ix_diagnostic_device_type", "device_id", "diagnostic_type"),
    )
    
    def __repr__(self):
        return f"<DiagnosticLog {self.diagnostic_type} device={self.device_id} status={self.status}>"


class WifiSnapshot(Base):
    """
    Snapshot periódico de configuração WiFi.
    Permite histórico de mudanças e análise de drift.
    """
    __tablename__ = "wifi_snapshots"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Band
    band = Column(String(10), nullable=False)  # 2.4GHz, 5GHz
    
    # Configuração
    ssid = Column(String(64))
    hidden = Column(Boolean, default=False)
    enabled = Column(Boolean, default=True)
    security_mode = Column(String(50))  # WPA2-PSK, WPA3, etc
    encryption = Column(String(20))  # AES, TKIP
    channel = Column(Integer)
    bandwidth = Column(String(20))  # 20MHz, 40MHz, 80MHz
    tx_power = Column(Integer)  # percentual ou dBm
    
    # Clientes conectados no momento
    connected_clients = Column(Integer, default=0)
    client_macs = Column(JSON, default=list)  # lista de MACs
    
    # Timestamp
    captured_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relacionamento
    device = relationship("Device", back_populates="wifi_snapshots")
    
    def __repr__(self):
        return f"<WifiSnapshot {self.band} ssid={self.ssid} at {self.captured_at}>"


class ClientSession(Base):
    """
    Histórico de sessões de clientes WiFi/LAN.
    Permite análise de padrões de uso.
    """
    __tablename__ = "client_sessions"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Identificação do cliente
    mac_address = Column(String(17), nullable=False, index=True)
    hostname = Column(String(100))
    ip_address = Column(String(45))
    
    # Tipo de conexão
    connection_type = Column(String(20))  # wifi_24ghz, wifi_5ghz, ethernet
    
    # Sessão
    connected_at = Column(DateTime, default=datetime.utcnow)
    disconnected_at = Column(DateTime)
    duration_seconds = Column(Integer)
    
    # Métricas WiFi (se aplicável)
    rssi = Column(Integer)  # dBm
    tx_rate = Column(Integer)  # Mbps
    rx_rate = Column(Integer)  # Mbps
    
    # Tráfego
    bytes_rx = Column(Float, default=0)
    bytes_tx = Column(Float, default=0)
    
    # Relacionamento
    device = relationship("Device", back_populates="sessions")
    
    __table_args__ = (
        Index("ix_client_sessions_mac", "mac_address"),
        Index("ix_client_sessions_device_time", "device_id", "connected_at"),
    )
    
    def __repr__(self):
        return f"<ClientSession {self.mac_address} on device={self.device_id}>"


class AlertEvent(Base):
    """
    Eventos de alerta/anomalia detectados pelo sistema.
    Base para notificações e análise.
    """
    __tablename__ = "alert_events"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"))
    
    # Classificação
    severity = Column(String(20), nullable=False, index=True)  # info, warning, error, critical
    category = Column(String(50), nullable=False, index=True)  # connectivity, wifi, wan, security, performance
    
    # Detalhes
    title = Column(String(255), nullable=False)
    message = Column(Text)
    details = Column(JSON, default=dict)
    
    # Status
    status = Column(String(20), default="active")  # active, acknowledged, resolved
    acknowledged_at = Column(DateTime)
    acknowledged_by = Column(String(100))
    resolved_at = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Relacionamento
    device = relationship("Device", back_populates="alerts")
    
    __table_args__ = (
        Index("ix_alerts_severity_status", "severity", "status"),
    )
    
    def __repr__(self):
        return f"<AlertEvent [{self.severity}] {self.title}>"


class TaskHistory(Base):
    """
    Histórico de tarefas enviadas aos dispositivos.
    Rastreabilidade de comandos executados.
    """
    __tablename__ = "task_history"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Identificação da tarefa
    genie_task_id = Column(String(50), index=True)  # _id no GenieACS
    task_type = Column(String(50), nullable=False)  # reboot, setParameterValues, download, etc
    
    # Parâmetros
    parameters = Column(JSON, default=dict)
    
    # Status
    status = Column(String(20), default="pending")  # pending, running, success, failed
    fault_code = Column(String(20))
    fault_message = Column(Text)
    
    # Quem disparou
    triggered_by = Column(String(100))  # user, scheduler, automation
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    started_at = Column(DateTime)
    completed_at = Column(DateTime)
    
    # Relacionamento
    device = relationship("Device", back_populates="tasks")
    
    def __repr__(self):
        return f"<TaskHistory {self.task_type} device={self.device_id} status={self.status}>"


# ============ Tabelas auxiliares ============

class SystemConfig(Base):
    """
    Configurações do sistema armazenadas no banco.
    """
    __tablename__ = "system_config"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    key = Column(String(100), unique=True, nullable=False, index=True)
    value = Column(Text)
    value_type = Column(String(20), default="string")  # string, int, float, bool, json
    description = Column(Text)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    def __repr__(self):
        return f"<SystemConfig {self.key}={self.value}>"


class MetricAggregation(Base):
    """
    Agregações de métricas por período (hora, dia, semana).
    Otimiza queries de histórico longo.
    """
    __tablename__ = "metric_aggregations"
    
    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False)
    
    # Período
    period_type = Column(String(10), nullable=False)  # hour, day, week, month
    period_start = Column(DateTime, nullable=False)
    period_end = Column(DateTime, nullable=False)
    
    # Agregações de tráfego
    total_bytes_rx = Column(Float, default=0)
    total_bytes_tx = Column(Float, default=0)
    avg_bytes_rx = Column(Float, default=0)
    avg_bytes_tx = Column(Float, default=0)
    
    # Agregações de latência
    avg_latency = Column(Float)
    min_latency = Column(Float)
    max_latency = Column(Float)
    p95_latency = Column(Float)
    
    # Disponibilidade
    uptime_percentage = Column(Float)
    total_samples = Column(Integer, default=0)
    online_samples = Column(Integer, default=0)
    
    # Clientes
    avg_wifi_clients = Column(Float)
    max_wifi_clients = Column(Integer)
    
    __table_args__ = (
        Index("ix_aggregations_device_period", "device_id", "period_type", "period_start"),
        UniqueConstraint("device_id", "period_type", "period_start", name="uq_device_period"),
    )
    
    def __repr__(self):
        return f"<MetricAggregation {self.period_type} device={self.device_id}>"


class Conversation(Base):
    """
    Conversas com o serviço de LLM (ChatGPT).
    Permite armazenar prompts/ respostas para auditoria e uso em RAG / fine-tune.
    """
    __tablename__ = "conversations"

    id = Column(Integer, primary_key=True, autoincrement=True)
    title = Column(String(255), nullable=True)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    meta = Column(JSON, default=dict)

    messages = relationship("ConversationMessage", back_populates="conversation", cascade="all, delete-orphan")

    def __repr__(self):
        return f"<Conversation id={self.id} title={self.title}>"


class ConversationMessage(Base):
    """
    Mensagens dentro de uma conversa com o LLM.
    role: system|user|assistant
    """
    __tablename__ = "conversation_messages"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="CASCADE"), nullable=False, index=True)
    role = Column(String(20), nullable=False, index=True)
    content = Column(Text, nullable=False)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)
    tokens = Column(Integer)
    extra = Column(JSON, default=dict)

    conversation = relationship("Conversation", back_populates="messages")

    def __repr__(self):
        return f"<ConvMsg {self.role} conv={self.conversation_id} id={self.id}>"


class Embedding(Base):
    """
    Embeddings armazenadas para RAG e recuperação por similaridade.
    Guarda vetores gerados pela API de embeddings (OpenAI) e um trecho de texto associado.
    """
    __tablename__ = "embeddings"

    id = Column(Integer, primary_key=True, autoincrement=True)
    conversation_id = Column(Integer, ForeignKey("conversations.id", ondelete="SET NULL"), nullable=True)
    message_id = Column(Integer, ForeignKey("conversation_messages.id", ondelete="SET NULL"), nullable=True)
    text = Column(Text)
    vector = Column(JSON, default=list)
    meta = Column(JSON, default=dict)
    created_at = Column(DateTime, default=datetime.utcnow, index=True)

    def __repr__(self):
        return f"<Embedding id={self.id} conv={self.conversation_id} msg={self.message_id}>"


class DeviceConfigBackup(Base):
    """
    Backup de configurações do dispositivo.
    Salva automaticamente quando configurações são alteradas.
    Permite restauração automática após factory reset.
    """
    __tablename__ = "device_config_backups"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), nullable=False, index=True)
    
    # Identificação única do dispositivo (para match após reset)
    serial_number = Column(String(100), nullable=False, index=True)
    mac_address = Column(String(17), index=True)  # WAN MAC ou LAN MAC
    
    # Configurações salvas (JSON completo)
    wifi_config = Column(JSON, default=dict)  # SSID, senha, canal, etc
    wan_config = Column(JSON, default=dict)  # PPPoE, IP, etc
    lan_config = Column(JSON, default=dict)  # IP, DHCP, etc
    firewall_config = Column(JSON, default=dict)  # Port forward, DMZ, etc
    extra_config = Column(JSON, default=dict)  # Outras configurações
    
    # Parâmetros TR-069 brutos para restore
    tr069_params = Column(JSON, default=list)  # Lista de {path, value, type}
    
    # Metadata
    is_active = Column(Boolean, default=True)  # Backup atual ativo
    is_auto_restore_enabled = Column(Boolean, default=True)  # Restaurar automaticamente?
    restore_count = Column(Integer, default=0)  # Quantas vezes foi restaurado
    last_restored_at = Column(DateTime)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    updated_at = Column(DateTime, default=datetime.utcnow, onupdate=datetime.utcnow)
    
    # Relacionamento
    device = relationship("Device", backref="config_backups")
    
    __table_args__ = (
        Index("ix_config_backup_serial", "serial_number"),
        Index("ix_config_backup_device_active", "device_id", "is_active"),
    )
    
    def __repr__(self):
        return f"<DeviceConfigBackup device={self.device_id} serial={self.serial_number}>"


class DeviceBootstrapEvent(Base):
    """
    Eventos de bootstrap (factory reset) detectados.
    Usado para tracking e auto-restore.
    """
    __tablename__ = "device_bootstrap_events"

    id = Column(Integer, primary_key=True, autoincrement=True)
    device_id = Column(Integer, ForeignKey("devices.id", ondelete="CASCADE"), index=True)
    
    # Identificação
    serial_number = Column(String(100), nullable=False, index=True)
    genie_device_id = Column(String(255), index=True)  # _id do GenieACS
    
    # Evento
    event_type = Column(String(50), nullable=False)  # bootstrap, first_connect, reconnect_after_reset
    detected_at = Column(DateTime, default=datetime.utcnow, index=True)
    
    # Estado anterior (se conhecido)
    previous_uptime = Column(Integer)  # uptime antes do reset
    previous_config_hash = Column(String(64))  # hash da config anterior
    
    # Ação tomada
    action_taken = Column(String(50))  # auto_restore, manual, none
    restore_status = Column(String(20))  # pending, success, failed, skipped
    restore_details = Column(JSON, default=dict)
    
    # Timestamps
    created_at = Column(DateTime, default=datetime.utcnow)
    
    # Relacionamento
    device = relationship("Device", backref="bootstrap_events")
    
    def __repr__(self):
        return f"<DeviceBootstrapEvent {self.event_type} serial={self.serial_number}>"
