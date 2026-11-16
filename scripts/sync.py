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
import re
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


def pedir(caminho, params, base=None):
    chave = os.environ.get("INTERVALS_API_KEY", "").strip()
    if not chave:
        sys.exit("Falta a variável INTERVALS_API_KEY. No GitHub, crie o segredo em Settings > Secrets and variables > Actions.")
    query = "&".join(f"{k}={v}" for k, v in params.items())
    req = urllib.request.Request(f"{base or API}{caminho}?{query}")
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
        if e.code in (401, 403) and base is None:  # nos pedidos do mapa, um erro só pula aquele treino
            detalhe = e.read(300).decode("utf-8", "replace").strip()
            sys.exit("O Intervals.icu recusou o pedido (erro %d) em %s. Confira o segredo INTERVALS_API_KEY "
                     "(deve ser a API Key de Settings > Developer Settings, não o ID do atleta) e o atleta_id em config/site.json.\n"
                     "Resposta do servidor: %s" % (e.code, API, detalhe))
        raise


ZONA_PRIVADA_M = 500   # metros cortados do começo e do fim de cada percurso (protege casa e trabalho)
MAX_PONTOS_ROTA = 400  # pontos por percurso no site (o suficiente para desenhar, leve para carregar)


def dist_m(a, b):
    import math
    r = math.pi / 180
    dlat, dlng = (b[0] - a[0]) * r, (b[1] - a[1]) * r
    h = math.sin(dlat / 2) ** 2 + math.cos(a[0] * r) * math.cos(b[0] * r) * math.sin(dlng / 2) ** 2
    return 2 * 6371000 * math.asin(math.sqrt(h))


def cortar_pontas(pontos, metros):
    """Tira os primeiros e os últimos `metros` do percurso."""
    def corta_inicio(seq):
        andado = 0
        for i in range(1, len(seq)):
            andado += dist_m(seq[i - 1], seq[i])
            if andado >= metros:
                return seq[i:]
        return []
    pontos = corta_inicio(pontos)
    return corta_inicio(pontos[::-1])[::-1]


def simplificar(pontos, maximo=MAX_PONTOS_ROTA):
    if len(pontos) <= maximo:
        return pontos
    passo = len(pontos) / maximo
    return [pontos[int(i * passo)] for i in range(maximo)] + [pontos[-1]]


def mapa_do_treino(id_atividade):
    """Devolve (local aproximado a 0,1°, percurso sem as pontas) ou (None, None) para treino sem GPS."""
    try:
        m = pedir(f"/activity/{id_atividade}/map", {}, base="https://intervals.icu/api/v1")
    except Exception:
        return None, None  # rolo, piscina, academia ou mapa indisponível
    if not isinstance(m, dict):
        return None, None
    pontos = [p for p in (m.get("latlngs") or [])
              if isinstance(p, (list, tuple)) and len(p) >= 2 and p[0] is not None and p[1] is not None]
    b = m.get("bounds")
    try:
        lat, lng = (b[0][0] + b[1][0]) / 2, (b[0][1] + b[1][1]) / 2
    except (TypeError, IndexError, KeyError):
        if not pontos:
            return None, None
        lat, lng = sum(p[0] for p in pontos) / len(pontos), sum(p[1] for p in pontos) / len(pontos)
    rota = [[round(p[0], 5), round(p[1], 5)] for p in simplificar(cortar_pontas(pontos, ZONA_PRIVADA_M))]
    return [round(lat, 1), round(lng, 1)], rota


def nome_do_lugar(lat, lng):
    """Cidade e país pelo OpenStreetMap (Nominatim). Só é chamado uma vez por local novo."""
    url = (f"https://nominatim.openstreetmap.org/reverse?format=jsonv2&zoom=10&accept-language=pt-BR"
           f"&lat={lat}&lon={lng}")
    req = urllib.request.Request(url, headers={"User-Agent": "site-treinos-sync/1.0"})
    try:
        with urllib.request.urlopen(req, timeout=30) as r:
            j = json.load(r)
    except Exception:
        return None
    a = j.get("address") or {}
    cidade = a.get("city") or a.get("town") or a.get("village") or a.get("municipality") or a.get("county") or a.get("state")
    return {"cidade": cidade, "estado": a.get("state"), "pais": a.get("country"), "cc": (a.get("country_code") or "").upper()}


def atualizar_locais(atividades, virtuais, limite=500):
    """Atualiza data/locais.json (local de cada treino), data/rotas/<id>.json (percurso) e data/lugares.json (nomes)."""
    import time
    arquivo = DADOS / "locais.json"
    pasta = DADOS / "rotas"
    pasta.mkdir(exist_ok=True)
    locais = json.loads(arquivo.read_text(encoding="utf-8")) if arquivo.exists() else {}
    novos = 0
    for a in atividades:
        if not a.get("distancia_km") or a["tipo"] not in ("Run", "Ride", "Swim"):
            continue
        if a["id"] in virtuais:
            locais[a["id"]] = None
            continue
        ja_tem_rota = (pasta / f"{a['id']}.json").exists()
        if a["id"] in locais and (locais[a["id"]] is None or ja_tem_rota):
            continue
        if novos >= limite:
            break
        local, rota = mapa_do_treino(a["id"])
        locais[a["id"]] = local
        if local is not None:
            (pasta / f"{a['id']}.json").write_text(json.dumps(rota or [], separators=(",", ":")), encoding="utf-8")
        novos += 1
    ids = {a["id"] for a in atividades}
    locais = {k: v for k, v in locais.items() if k in ids}
    arquivo.write_text(json.dumps(locais, separators=(",", ":")), encoding="utf-8")

    # nomes dos lugares (uma consulta por local novo, respeitando o limite de 1 por segundo do Nominatim)
    arq_lugares = DADOS / "lugares.json"
    lugares = json.loads(arq_lugares.read_text(encoding="utf-8")) if arq_lugares.exists() else {}
    chaves = sorted({f"{p[0]:.1f},{p[1]:.1f}" for p in locais.values() if p})
    for k in chaves:
        if k in lugares:
            continue
        lat, lng = k.split(",")
        nome = nome_do_lugar(lat, lng)
        if nome:
            lugares[k] = nome
        time.sleep(1.2)
    arq_lugares.write_text(json.dumps(lugares, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    print(f"{novos} treinos consultados para o mapa; {sum(1 for v in locais.values() if v)} com local; {len(lugares)} lugares com nome.")


def periodos(inicio, fim, dias=180):
    """Divide o histórico em blocos para não pedir anos de uma vez."""
    a = inicio
    while a <= fim:
        b = min(fim, a + dt.timedelta(days=dias - 1))
        yield a, b
        a = b + dt.timedelta(days=1)


def numero(v, casas=1):
    return round(float(v), casas) if v is not None else None


PALAVRAS = [("Swim", ("swim", "nata", "piscina")), ("Ride", ("bike", "ride", "pedal", "cicl", "rolo")),
            ("Run", ("run", "corr", "rodagem", "longão", "tiro")), ("Strength", ("strength", "força", "forca", "muscula", "academia"))]


def tipo_por_texto(texto):
    t = texto.lower()
    for tipo, chaves in PALAVRAS:
        if any(c in t for c in chaves):
            return tipo
    return "Other"


def ler_ical(url, ini, fim):
    """Lê o calendário do TrainingPeaks (link iCal) e devolve os treinos entre ini e fim."""
    url = url.replace("webcal://", "https://", 1)
    req = urllib.request.Request(url, headers={"User-Agent": "site-treinos-sync/1.0"})
    with urllib.request.urlopen(req, timeout=60) as r:
        texto = r.read().decode("utf-8", "replace")
    linhas = []
    for l in texto.splitlines():  # linhas que começam com espaço continuam a anterior
        if l[:1] in (" ", "\t") and linhas:
            linhas[-1] += l[1:]
        else:
            linhas.append(l)
    eventos, ev = [], None
    for l in linhas:
        if l == "BEGIN:VEVENT":
            ev = {}
        elif l == "END:VEVENT" and ev is not None:
            eventos.append(ev)
            ev = None
        elif ev is not None and ":" in l:
            chave, valor = l.split(":", 1)
            ev[chave.split(";")[0]] = valor.replace("\\n", "\n").replace("\\,", ",").replace("\\;", ";")
    saida = []
    for ev in eventos:
        inicio = ev.get("DTSTART", "")[:8]
        if len(inicio) != 8:
            continue
        data = dt.date(int(inicio[:4]), int(inicio[4:6]), int(inicio[6:8]))
        if not (ini <= data <= fim):
            continue
        titulo, desc = ev.get("SUMMARY", "Treino"), ev.get("DESCRIPTION", "")
        tempo = None
        m = re.search(r"(?:planned time|duration|duração|tempo)[^0-9]{0,20}(\d{1,2}):(\d{2})(?::(\d{2}))?", desc, re.I)
        if m:
            tempo = int(m.group(1)) * 60 + int(m.group(2)) + (int(m.group(3) or 0) / 60)
        km = None
        m = re.search(r"(?:planned distance|distance|distância)[^0-9]{0,20}([\d.,]+)\s*(km|m|mi)\b", desc, re.I)
        if m:
            v = float(m.group(1).replace(",", "."))
            km = v / 1000 if m.group(2).lower() == "m" else v * 1.609 if m.group(2).lower() == "mi" else v
        saida.append({
            "data": data.isoformat(), "tipo": tipo_por_texto(titulo + " " + desc[:80]), "nome": titulo,
            "tempo_min": round(tempo) if tempo else None, "distancia_km": round(km, 1) if km else None,
            "carga": None, "descricao": desc[:300], "fonte": "TrainingPeaks",
        })
    return saida


def main():
    global API
    site = json.loads((RAIZ / "config" / "site.json").read_text(encoding="utf-8"))
    API = API_BASE + str(site.get("atleta_id") or "0").strip()
    inicio = dt.date.fromisoformat(site.get("historico_desde", "2025-01-01"))
    hoje = dt.date.today()

    atividades, puladas_strava, virtuais = [], 0, set()
    for a, b in periodos(inicio, hoje):
        for x in pedir("/activities", {"oldest": a.isoformat(), "newest": b.isoformat()}):
            if x.get("_note") or x.get("source") == "STRAVA":
                puladas_strava += 1  # o Intervals.icu não repassa treinos que vieram do Strava
                continue
            tipo = TIPOS.get(x.get("type") or "", "Other")
            if (x.get("type") or "").startswith("Virtual") or x.get("trainer"):
                virtuais.add(str(x.get("id")))  # rolo/esteira: sem local
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
            })
    bem_estar.sort(key=lambda r: r["data"] or "")

    # treinos planejados: os do calendário do Intervals.icu e, se houver, os do TrainingPeaks (link iCal)
    planejados = []
    janela_ini, janela_fim = hoje - dt.timedelta(days=70), hoje + dt.timedelta(days=70)
    for e in pedir("/events", {"oldest": janela_ini.isoformat(), "newest": janela_fim.isoformat()}):
        if e.get("category") != "WORKOUT":
            continue
        planejados.append({
            "data": (e.get("start_date_local") or "")[:10],
            "tipo": TIPOS.get(e.get("type") or "", "Other"),
            "nome": e.get("name") or "Treino",
            "tempo_min": numero((e.get("moving_time") or 0) / 60, 0) or None,
            "distancia_km": numero((e.get("distance") or 0) / 1000, 1) or None,
            "carga": e.get("icu_training_load"),
            "descricao": (e.get("description") or "")[:300],
            "fonte": "Intervals.icu",
        })
    ical = os.environ.get("TRAININGPEAKS_ICAL", "").strip()
    if ical:
        try:
            planejados += ler_ical(ical, janela_ini, janela_fim)
        except Exception as erro:  # o site continua funcionando sem os planejados
            print(f"Atenção: não consegui ler o calendário do TrainingPeaks ({erro}).")
    planejados.sort(key=lambda r: r["data"])

    DADOS.mkdir(exist_ok=True)
    escrever = lambda nome, obj: (DADOS / nome).write_text(json.dumps(obj, ensure_ascii=False, separators=(",", ":")), encoding="utf-8")
    escrever("atividades.json", atividades)
    escrever("bem_estar.json", bem_estar)
    escrever("planejados.json", planejados)
    atualizar_locais(atividades, virtuais)
    print(f"{len(planejados)} treinos planejados salvos.")
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
