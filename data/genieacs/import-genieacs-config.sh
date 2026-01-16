#!/bin/bash
# Script para importar provisions e presets no GenieACS
# Execute: bash import-genieacs-config.sh

GENIEACS_NBI="http://localhost:7557"

echo "=== Importando Provisions e Presets para GenieACS ==="

# Verifica se o GenieACS NBI está rodando
if ! curl -s "$GENIEACS_NBI/devices?limit=1" > /dev/null 2>&1; then
    echo "ERRO: GenieACS NBI não está acessível em $GENIEACS_NBI"
    exit 1
fi

# === PROVISIONS ===
echo ""
echo "--- Importando Provisions ---"

# TR-181 Provision (para Zyxel e outros TR-181)
echo "Criando provision: tr181-provision"
PROVISION_TR181=$(cat provisions/tr181-provision.js)
curl -s -X PUT "$GENIEACS_NBI/provisions/tr181-provision" \
    -H "Content-Type: text/plain" \
    --data-binary "$PROVISION_TR181"
echo " [OK]"

# Multi-Brand Provision (universal)
echo "Criando provision: multi-brand-provision"
PROVISION_MULTI=$(cat provisions/multi-brand-provision.js)
curl -s -X PUT "$GENIEACS_NBI/provisions/multi-brand-provision" \
    -H "Content-Type: text/plain" \
    --data-binary "$PROVISION_MULTI"
echo " [OK]"

# === PRESETS ===
echo ""
echo "--- Importando Presets ---"

# Preset Zyxel TR-181
echo "Criando preset: preset-zyxel-tr181"
curl -s -X PUT "$GENIEACS_NBI/presets/preset-zyxel-tr181" \
    -H "Content-Type: application/json" \
    -d '{
        "weight": 100,
        "channel": "bootstrap",
        "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true, "6 CONNECTION REQUEST": true},
        "precondition": "{\"Device.DeviceInfo.Manufacturer\":{\"$regex\":\"Zyxel|ZYXEL|zyxel\"}}",
        "configurations": [
            {"type": "provision", "name": "tr181-provision"}
        ]
    }'
echo " [OK]"

# Preset TP-Link TR-181 (OUI 482254 com novo firmware)
echo "Criando preset: preset-tplink-tr181"
curl -s -X PUT "$GENIEACS_NBI/presets/preset-tplink-tr181" \
    -H "Content-Type: application/json" \
    -d '{
        "weight": 100,
        "channel": "bootstrap",
        "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true, "6 CONNECTION REQUEST": true},
        "precondition": "{\"_deviceId._OUI\":\"482254\",\"Device.DeviceInfo.Manufacturer\":{\"$exists\":true}}",
        "configurations": [
            {"type": "provision", "name": "tr181-provision"}
        ]
    }'
echo " [OK]"

# Preset Universal Multi-Brand (fallback)
echo "Criando preset: preset-multi-brand-universal"
curl -s -X PUT "$GENIEACS_NBI/presets/preset-multi-brand-universal" \
    -H "Content-Type: application/json" \
    -d '{
        "weight": 50,
        "channel": "default",
        "events": {"0 BOOTSTRAP": true, "1 BOOT": true, "2 PERIODIC": true},
        "precondition": "{}",
        "configurations": [
            {"type": "provision", "name": "multi-brand-provision"}
        ]
    }'
echo " [OK]"

echo ""
echo "=== Importação concluída! ==="
echo ""
echo "Provisions criados:"
curl -s "$GENIEACS_NBI/provisions" | python3 -c "import sys,json; data=json.load(sys.stdin); print('  - ' + '\n  - '.join([p.get('_id','?') for p in data]))" 2>/dev/null || echo "  (use curl $GENIEACS_NBI/provisions para verificar)"

echo ""
echo "Presets criados:"
curl -s "$GENIEACS_NBI/presets" | python3 -c "import sys,json; data=json.load(sys.stdin); print('  - ' + '\n  - '.join([p.get('_id','?') for p in data]))" 2>/dev/null || echo "  (use curl $GENIEACS_NBI/presets para verificar)"

echo ""
echo "Para forçar refresh em todos os dispositivos Zyxel:"
echo "  curl -X POST '$GENIEACS_NBI/tasks' -H 'Content-Type: application/json' -d '{\"name\":\"refreshObject\",\"objectName\":\"Device\"}' --globoff"
echo ""
