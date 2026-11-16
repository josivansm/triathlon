"""
Sincroniza treinos e bem-estar do Intervals.icu para os arquivos do site.

Roda sozinho todo dia pelo GitHub Actions (.github/workflows/sync.yml).
Para testar no seu computador:
    INTERVALS_API_KEY=sua_chave python scripts/sync.py

Usa só a biblioteca padrão do Python, sem instalar nada.
"""
import base64
import datetime as dt
import json
import os
import sys
import urllib.error
import urllib.request
from pathlib import Path

RAIZ = Path(__file__).resolve().parent.parent
DADOS = RAIZ / "data"
API_BASE = "https://intervals.icu/api/v1/athlete/"
API = API_BASE + "0"  # trocado em main() pelo "atleta_id" de config/site.json, se houver

TIPOS = {
    "Run": "Run", "TrailRun": "Run", "VirtualRun": "Run",
    "Ride": "Ride", "VirtualRide": "Ride", "GravelRide": "Ride",
    "MountainBikeRide": "Ride", "EBikeRide": "Ride",
    "Swim": "Swim", "OpenWaterSwim": "Swim",
    "WeightTraining": "Strength",
}


def pedir(caminho, params):
    chave = os.environ.get("INTERVALS_API_KEY", "").strip()
    if not chave:
        sys.exit("Falta a variável INTERVALS_API_KEY. No GitHub, crie o segredo em Settings > Secrets and variables > Actions.")
    query = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{API}{caminho}?{query}")
    # O usuário é literalmente o texto API_KEY; a senha é a sua chave.
    token = base64.b64encode(f"API_KEY:{chave}".encode()).decode()
    req.add_header("Authorization", f"Basic {token}")
    req.add_header("Accept", "application/json")
    # Sem um User-Agent próprio, o firewall do Intervals.icu pode bloquear o pedido (erro 403).
    req.add_header("User-Agent", "site-treinos-sync/1.0")
    try:
        with urllib.request.urlopen(req, timeout=60) as r:
            return json.load(r)
    except urllib.error.HTTPError as e:
        if e.code in (401, 403):
            detalhe = e.read(300).decode("utf-8", "replace").strip()
            sys.exit("O Intervals.icu recusou o pedido (erro %d) em %s. Confira o segredo INTERVALS_API_KEY "
                     "(deve ser a API Key de Settings > Developer Settings, não o ID do atleta) e o atleta_id em config/site.json.\n"
                     "Resposta do servidor: %s" % (e.code, API, detalhe))
        raise


def periodos(inicio, fim, dias=180):
    """Divide o histórico em blocos para não pedir anos de uma vez."""
    a = inicio
    while a <= fim:
        b = min(fim, a + dt.timedelta(days=dias - 1))
        yield a, b
        a = b + dt.timedelta(days=1)


def numero(v, casas=1):
    return round(float(v), casas) if v is not None else None


def main():
    global API
    site = json.loads((RAIZ / "config" / "site.json").read_text(encoding="utf-8"))
    API = API_BASE + str(site.get("atleta_id") or "0").strip()
    inicio = dt.date.fromisoformat(site.get("historico_desde", "2025-01-01"))
    hoje = dt.date.today()

    atividades, puladas_strava = [], 0
    for a, b in periodos(inicio, hoje):
        for x in pedir("/activities", {"oldest": a.isoformat(), "newest": b.isoformat()}):
            if x.get("_note") or x.get("source") == "STRAVA":
                puladas_strava += 1  # o Intervals.icu não repassa treinos que vieram do Strava
                continue
            tipo = TIPOS.get(x.get("type") or "", "Other")
            atividades.append({
                "id": str(x.get("id")),
                "data": (x.get("start_date_local") or "")[:10],
                "tipo": tipo,
                "nome": x.get("name") or "",
                "distancia_km": numero((x.get("distance") or 0) / 1000, 2),
                "tempo_min": numero((x.get("moving_time") or 0) / 60, 1),
                "elevacao_m": round(x.get("total_elevation_gain") or 0),
                "fc_media": round(x["average_heartrate"]) if x.get("average_heartrate") else None,
                "carga": round(x["icu_training_load"]) if x.get("icu_training_load") else None,
            })
    atividades.sort(key=lambda r: r["data"])

    bem_estar = []
    for a, b in periodos(inicio, hoje):
        for w in pedir("/wellness", {"oldest": a.isoformat(), "newest": b.isoformat()}):
            sono = w.get("sleepSecs")
            bem_estar.append({
                "data": w.get("id"),
                "sono_h": numero(sono / 3600) if sono else None,
                "sono_score": w.get("sleepScore"),
                "hrv": numero(w.get("hrv")),
                "fc_repouso": w.get("restingHR"),
                "ctl": numero(w.get("ctl")),
                "atl": numero(w.get("atl")),
                "peso": numero(w.get("weight")),
            })
    bem_estar.sort(key=lambda r: r["data"] or "")

    DADOS.mkdir(exist_ok=True)
    escrever = lambda nome, obj: (DADOS / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    escrever("atividades.json", atividades)
    escrever("bem_estar.json", bem_estar)
    escrever("meta.json", {
        "atualizado_em": dt.datetime.now(dt.timezone.utc).isoformat(timespec="minutes"),
        "exemplo": False,
        "fonte": "Intervals.icu",
    })

    print(f"{len(atividades)} treinos e {len(bem_estar)} dias de bem-estar salvos.")
    if puladas_strava:
        print(f"Atenção: {puladas_strava} treinos vieram do Strava e o Intervals.icu não os repassa pela API. "
              "Conecte o Garmin direto no Intervals.icu e use 'Import all Garmin data'.")


if __name__ == "__main__":
    main()
