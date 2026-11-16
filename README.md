# Meu site de treinos

Site em preto e branco com seus treinos, provas e recuperação, atualizado sozinho todo dia com os dados do seu Garmin.

**Como funciona:** Garmin → Garmin Connect → Intervals.icu → GitHub (todo dia às 6h de Manaus) → seu site.

---

## Passo 1. Intervals.icu (10 min)

1. Crie uma conta grátis em **intervals.icu**.
2. Vá em **Settings → Connections → Garmin Connect** e autorize. Marque:
   - **Download activities**
   - **Download wellness data** (sono, HRV, FC de repouso)
3. Ainda na conexão do Garmin, clique em **Import all Garmin data** para trazer o histórico.
4. Vá em **Settings → Developer Settings** e gere sua **API Key**. Copie e guarde.

> Importante: os treinos precisam chegar ao Intervals.icu **direto do Garmin**. Treinos que entram pelo Strava não são liberados pela API.

## Passo 2. GitHub (15 min)

1. Crie uma conta grátis em **github.com**.
2. Clique em **New repository**. Nome sugerido: `treinos`. Deixe **Public** (necessário para o site grátis).
3. Na página do repositório, clique em **uploading an existing file** e arraste **todo o conteúdo desta pasta** (incluindo a pasta `.github`). Clique em **Commit changes**.
   - Se a pasta `.github` não subir pelo navegador (ela é oculta em alguns computadores), crie o arquivo manualmente: **Add file → Create new file**, digite o nome `.github/workflows/sync.yml` e cole o conteúdo do arquivo.

## Passo 3. Guardar a chave em segredo

1. No repositório: **Settings → Secrets and variables → Actions → New repository secret**.
2. Name: `INTERVALS_API_KEY`. Secret: cole a chave do Passo 1. Salve.

A chave fica só no GitHub e nunca aparece no site.

## Passo 4. Ligar o site

1. **Settings → Pages**.
2. Em **Source**, escolha **Deploy from a branch**, branch **main**, pasta **/ (root)**. Salve.
3. Em 1 ou 2 minutos o endereço aparece no topo da página: `https://SEU-USUARIO.github.io/treinos/`.

## Passo 5. Primeira sincronização

1. Aba **Actions → Sincronizar Garmin → Run workflow**.
2. Espere ficar verde (cerca de 1 minuto). Seus dados substituem os de exemplo e o aviso some do site.

A partir daí roda sozinho todo dia. Se ficar vermelho, clique na execução para ver a mensagem de erro (ela está em português).

---

## Personalizar

Edite direto no GitHub (abra o arquivo e clique no lápis):

**`config/site.json`**: seu nome, a frase de apresentação, desde quando buscar o histórico e suas provas concluídas (são elas que geram os recordes pessoais):

```json
{ "data": "2026-04-12", "prova": "Meia Maratona do Rio", "distancia": "21K", "tempo": "1:44:58" }
```

**`config/provas.json`**: suas provas-alvo. Cada uma vira uma aba. Para uma prova só de corrida, deixe apenas `"Run"` em `metas` e `distancias`:

```json
{
  "id": "valencia-2027",
  "nome": "Maratona de Valência",
  "data": "2027-12-05",
  "inicio_ciclo": "2027-08-16",
  "distancias": { "Run": 42.2 },
  "metas": { "Run": { "semanal_km": 60, "maior_km": 32 } }
}
```

- `inicio_ciclo`: a partir de quando contar a preparação.
- `semanal_km`: meta de volume por semana, por esporte.
- `maior_km`: meta para o treino mais longo do ciclo.
- A data do 70.3 Rio (8/8/2027) veio de calendários não oficiais. Confirme no site da Unlimited Sports.

**`config/planejados.json`**: treinos planejados que você coloca à mão (por exemplo, uma vez por mês, a partir do calendário do Garmin ou do TrainingPeaks). Aparecem no Calendário com borda tracejada. `tipo` é `Run`, `Ride`, `Swim`, `Strength` ou `Other`; `tempo_min`, `distancia_km` e `descricao` são opcionais:

```json
[
  { "data": "2026-12-01", "tipo": "Run", "nome": "Rodagem Z2", "tempo_min": 45, "distancia_km": 8, "descricao": "10 min aquecimento, 30 min Z2, 5 min solto" }
]
```

## Domínio próprio (opcional)

Compre um domínio (ex.: `seunome.com`), vá em **Settings → Pages → Custom domain** e siga as instruções de DNS do GitHub.

## Privacidade

Repositório público significa que os arquivos em `data/` (treinos, sono, HRV, peso) ficam visíveis para quem procurar. O site não guarda mapas nem localização GPS. Se não quiser expor peso, apague a linha `"peso"` em `scripts/sync.py`.

## Testar no computador (opcional)

```
INTERVALS_API_KEY=sua_chave python3 scripts/sync.py
python3 -m http.server
```
e abra `http://localhost:8000`.
