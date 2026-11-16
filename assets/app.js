/* Site de treinos: lê data/*.json (gerados pelo scripts/sync.py) e config/*.json. */
(function () {
  'use strict';

  const ESPORTES = {
    Swim: { nome: 'Natação', cor: '#ffffff' },
    Ride: { nome: 'Bike', cor: '#9a9a9a' },
    Run: { nome: 'Corrida', cor: '#4a4a4a' },
    Strength: { nome: 'Musculação', cor: '#2a2a2a' },
  };
  const ORDEM = ['Swim', 'Ride', 'Run'];
  const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];

  // ---------- utilidades ----------
  const $ = (sel) => document.querySelector(sel);
  const el = (tag, attrs, ...filhos) => {
    const e = document.createElement(tag);
    for (const [k, v] of Object.entries(attrs || {})) {
      if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v; else e.setAttribute(k, v);
    }
    for (const f of filhos.flat()) if (f != null) e.append(f.nodeType ? f : document.createTextNode(String(f)));
    return e;
  };
  const hojeISO = () => { const d = new Date(); return new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate())).toISOString().slice(0, 10); };
  const utc = (iso) => new Date(iso + 'T00:00:00Z');
  const diasEntre = (a, b) => Math.round((utc(b) - utc(a)) / 864e5);
  const segunda = (iso) => { const d = utc(iso); d.setUTCDate(d.getUTCDate() - ((d.getUTCDay() + 6) % 7)); return d.toISOString().slice(0, 10); };
  const somaDias = (iso, n) => { const d = utc(iso); d.setUTCDate(d.getUTCDate() + n); return d.toISOString().slice(0, 10); };
  const fmt = (v, casas = 0) => v == null || !isFinite(v) ? '—' : v.toLocaleString('pt-BR', { minimumFractionDigits: casas, maximumFractionDigits: casas });
  const dataCurta = (iso) => iso.slice(8, 10) + '/' + iso.slice(5, 7);
  const dataLonga = (iso) => +iso.slice(8, 10) + ' de ' + ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'][+iso.slice(5, 7) - 1] + ' de ' + iso.slice(0, 4);
  const horas = (min) => { const h = Math.floor(min / 60), m = Math.round(min % 60); return h + 'h' + String(m).padStart(2, '0'); };
  const segs = (t) => String(t).split(':').reduce((a, v) => a * 60 + +v, 0);
  const ritmo = (a) => {
    if (!a.distancia_km) return '—';
    if (a.tipo === 'Ride') return fmt(a.distancia_km / (a.tempo_min / 60), 1) + ' km/h';
    const porKm = a.tipo === 'Swim' ? a.tempo_min / (a.distancia_km * 10) : a.tempo_min / a.distancia_km;
    let m = Math.floor(porKm), s = Math.round((porKm - m) * 60); if (s === 60) { m++; s = 0; }
    return m + ':' + String(s).padStart(2, '0') + (a.tipo === 'Swim' ? ' /100m' : ' /km');
  };
  const soma = (arr, f) => arr.reduce((t, x) => t + (+f(x) || 0), 0);

  async function carregar(caminho) {
    const r = await fetch(caminho + '?v=' + Date.now());
    if (!r.ok) throw new Error('Não foi possível ler ' + caminho);
    return r.json();
  }

  // ---------- gráficos ----------
  function dica(box) { return d3.select(box).append('div').attr('class', 'dica'); }
  function posDica(d, ev, box) {
    const [x, y] = d3.pointer(ev, box), w = d.node().offsetWidth;
    d.style('left', Math.min(box.clientWidth - w, Math.max(0, x - w / 2)) + 'px').style('top', Math.max(0, y - 64) + 'px').style('opacity', 1);
  }
  function eixos(svg, x, y, W, H, m, fmtX, fmtY, valoresX) {
    const ya = svg.append('g').attr('transform', `translate(${m.l},0)`).call(d3.axisLeft(y).ticks(4).tickSize(-(W - m.l - m.r)).tickFormat(fmtY || ((v) => v)));
    ya.select('.domain').remove(); ya.selectAll('line').attr('stroke', '#1c1c1c');
    const eixoX = x.bandwidth ? d3.axisBottom(x).tickValues(valoresX) : d3.axisBottom(x).ticks(Math.max(2, Math.floor((W - m.l) / 70)));
    const xa = svg.append('g').attr('transform', `translate(0,${H - m.b})`).call(eixoX.tickFormat(fmtX).tickSize(0).tickPadding(8));
    xa.select('.domain').attr('stroke', '#3a3a3a');
  }

  // Barras empilhadas por esporte. linhas: [{chave, rotulo, Swim, Ride, Run}]
  function barrasEmpilhadas(box, linhas, { unidade, fmtX, meta, esportes = ORDEM, alt }) {
    box.replaceChildren();
    const W = Math.max(280, box.clientWidth), H = 240, m = { t: 12, r: 6, b: 26, l: 38 };
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', alt);
    const pilha = d3.stack().keys(esportes)(linhas);
    const x = d3.scaleBand().domain(linhas.map((l) => l.chave)).range([m.l, W - m.r]).padding(0.22);
    const topo = d3.max(linhas, (l) => soma(esportes, (e) => l[e])) || 1;
    const y = d3.scaleLinear().domain([0, Math.max(topo, meta || 0) * 1.08]).nice().range([H - m.b, m.t]);
    const passo = Math.ceil(linhas.length / Math.max(2, Math.floor((W - m.l) / 46)));
    eixos(svg, x, y, W, H, m, fmtX, null, linhas.map((l) => l.chave).filter((_, i) => i % passo === 0));
    svg.append('g').selectAll('g').data(pilha).join('g').attr('fill', (s) => esportes.length === 1 ? '#fff' : ESPORTES[s.key].cor)
      .selectAll('rect').data((s) => s).join('rect')
      .attr('x', (d) => x(d.data.chave)).attr('width', x.bandwidth())
      .attr('y', (d) => y(d[1])).attr('height', (d) => Math.max(0, y(d[0]) - y(d[1])));
    if (meta) {
      svg.append('line').attr('x1', m.l).attr('x2', W - m.r).attr('y1', y(meta)).attr('y2', y(meta)).attr('stroke', '#fff').attr('stroke-dasharray', '4 4');
      svg.append('text').attr('x', W - m.r).attr('y', y(meta) - 6).attr('text-anchor', 'end').style('fill', '#fff')
        .attr('stroke', '#000').attr('stroke-width', 4).attr('paint-order', 'stroke').text('meta ' + fmt(meta) + ' ' + unidade);
    }
    const t = dica(box);
    svg.append('g').selectAll('rect').data(linhas).join('rect')
      .attr('x', (d) => x(d.chave) - x.step() * x.padding() / 2).attr('width', x.step()).attr('y', m.t).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev, d) => {
        t.text('');
        t.append('b').text(d.rotulo);
        esportes.forEach((e) => { if (d[e]) t.append('div').text(ESPORTES[e].nome + ': ' + fmt(d[e], 1) + ' ' + unidade); });
        if (esportes.length > 1) t.append('div').text('Total: ' + fmt(soma(esportes, (e) => d[e]), 1) + ' ' + unidade);
        posDica(t, ev, box);
      })
      .on('pointerleave', () => t.style('opacity', 0));
  }

  // Linhas no tempo. serie: [{data, ...}]
  function linhasTempo(box, serie, { campos, desenhar, dicaTexto, dominio, fmtY, alt }) {
    box.replaceChildren();
    if (!serie.length) { box.append(el('p', { class: 'vazio', text: 'Ainda não há dados para este gráfico.' })); return; }
    const W = Math.max(280, box.clientWidth), H = 230, m = { t: 12, r: 6, b: 26, l: 38 };
    const dados = serie.map((d) => Object.assign({ t: utc(d.data) }, d));
    const svg = d3.select(box).append('svg').attr('viewBox', `0 0 ${W} ${H}`).attr('width', '100%').attr('role', 'img').attr('aria-label', alt);
    const x = d3.scaleUtc().domain(d3.extent(dados, (d) => d.t)).range([m.l, W - m.r]);
    const vals = dados.flatMap((d) => campos.map((c) => d[c])).filter((v) => v != null);
    const y = d3.scaleLinear().domain(dominio ? dominio(vals) : d3.extent(vals)).nice().range([H - m.b, m.t]);
    eixos(svg, x, y, W, H, m, d3.utcFormat('%d/%m'), fmtY);
    desenhar(svg, dados, x, y);
    const guia = svg.append('line').attr('y1', m.t).attr('y2', H - m.b).attr('stroke', '#fff').attr('stroke-opacity', 0.35).style('display', 'none');
    const t = dica(box), bis = d3.bisector((d) => d.t).center;
    svg.append('rect').attr('x', m.l).attr('y', m.t).attr('width', W - m.l - m.r).attr('height', H - m.t - m.b).attr('fill', 'transparent')
      .on('pointerenter pointermove', (ev) => {
        const d = dados[bis(dados, x.invert(d3.pointer(ev)[0]))];
        guia.style('display', null).attr('x1', x(d.t)).attr('x2', x(d.t));
        t.text(''); t.append('b').text(dataCurta(d.data) + '/' + d.data.slice(0, 4));
        dicaTexto(d).forEach((l) => t.append('div').text(l));
        posDica(t, ev, box);
      })
      .on('pointerleave', () => { t.style('opacity', 0); guia.style('display', 'none'); });
  }
  const linha = (svg, dados, x, y, campo, cor, tracejado) => svg.append('path').datum(dados.filter((d) => d[campo] != null))
    .attr('fill', 'none').attr('stroke', cor).attr('stroke-width', 2).attr('stroke-dasharray', tracejado ? '5 4' : null)
    .attr('d', d3.line().x((d) => x(d.t)).y((d) => y(d[campo])));

  const legenda = (esportes) => el('ul', { class: 'legenda' }, esportes.map((e) => el('li', {}, el('i', { style: 'background:' + ESPORTES[e].cor + ';border:1px solid #555' }), ESPORTES[e].nome)));

  // Gráficos são redesenhados quando a largura muda.
  let desenhos = [];
  const agendar = (box, fn) => { desenhos.push([box, fn]); fn(); };
  let ultimaLargura = 0;
  new ResizeObserver(() => {
    const w = document.body.clientWidth;
    if (Math.abs(w - ultimaLargura) < 8) return;
    ultimaLargura = w; desenhos.forEach(([box, fn]) => box.isConnected && fn());
  }).observe(document.body);

  // ---------- páginas ----------
  function numero(rotulo, valor, unidade, nota) {
    return el('div', { class: 'numero' }, el('dt', { text: rotulo }), el('dd', {}, valor, unidade ? el('small', { text: unidade }) : null),
      nota ? el('dd', { class: 'comparacao', text: nota }) : null);
  }

  // metas de ritmo: natação em min/100 m, bike em km/h, corrida em min/km
  const hms = (s) => { s = Math.round(s); return Math.floor(s / 3600) + ':' + String(Math.floor(s % 3600 / 60)).padStart(2, '0') + ':' + String(s % 60).padStart(2, '0'); };
  const mmss = (s) => { s = Math.round(s); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
  const segEtapa = (e, meta, km) => e === 'Ride' ? km / +meta * 3600 : segs(meta) * (e === 'Swim' ? km * 10 : km);
  const fmtRitmo = (e, v) => e === 'Ride' ? fmt(v, 1) + ' km/h' : mmss(v) + (e === 'Swim' ? ' /100m' : ' /km');
  function metaProva(p) {
    if (!p.ritmos_meta || !p.distancias) return null;
    const etapas = ORDEM.filter((e) => p.ritmos_meta[e] && p.distancias[e]).map((e) => ({ e, s: segEtapa(e, p.ritmos_meta[e], p.distancias[e]) }));
    if (!etapas.length) return null;
    const transicoes = p.meta_transicoes ? segs(p.meta_transicoes) : 0;
    return { etapas, transicoes, total: soma(etapas, (x) => x.s) + transicoes };
  }
  // ritmo médio real (ponderado pela distância) de um esporte numa lista de treinos
  function ritmoReal(lista, e) {
    const l = lista.filter((a) => a.tipo === e && a.distancia_km > 0 && a.tempo_min > 0);
    const km = soma(l, (a) => a.distancia_km), seg = soma(l, (a) => a.tempo_min) * 60;
    if (!km) return null;
    return e === 'Ride' ? km / (seg / 3600) : seg / (e === 'Swim' ? km * 10 : km);
  }
  function secaoRitmos(prova, atividades) {
    const m = metaProva(prova);
    if (!m) return null;
    const h = hojeISO(), recentes = atividades.filter((a) => a.data > somaDias(h, -28) && a.data <= h);
    const linhas = m.etapas.map(({ e, s }) => {
      const meta = e === 'Ride' ? +prova.ritmos_meta[e] : segs(prova.ritmos_meta[e]);
      const real = ritmoReal(recentes, e);
      // positivo = falta melhorar; na bike, mais rápido é número maior
      const falta = real == null ? null : e === 'Ride' ? meta - real : real - meta;
      const txtFalta = falta == null ? 'sem dados' : falta <= 0 ? 'no ritmo' : e === 'Ride' ? 'faltam ' + fmt(falta, 1) + ' km/h' : 'faltam ' + mmss(falta) + (e === 'Swim' ? ' /100m' : ' /km');
      return el('tr', {}, el('td', { text: ESPORTES[e].nome + ' ' + fmt(prova.distancias[e], 1) + ' km' }), el('td', { class: 'n', text: fmtRitmo(e, meta) }),
        el('td', { class: 'n' }, el('b', { text: hms(s) })), el('td', { class: 'n', text: real == null ? '—' : fmtRitmo(e, real) }), el('td', { class: 'n', text: txtFalta }));
    });
    if (m.transicoes) linhas.push(el('tr', {}, el('td', { text: 'Transições' }), el('td', {}), el('td', { class: 'n' }, el('b', { text: hms(m.transicoes) })), el('td', {}), el('td', {})));
    linhas.push(el('tr', { class: 'total' }, el('td', { text: m.transicoes ? 'Total' : 'Total sem transições' }), el('td', {}), el('td', { class: 'n' }, el('b', { text: hms(m.total) })), el('td', {}), el('td', {})));
    return secao('Ritmos-alvo', 'Tempo de cada etapa no ritmo da meta, comparado com seu ritmo médio nas últimas 4 semanas de treino. Treino não é prova: serve para ver a tendência.',
      el('div', { class: 'tabela-wrap' }, el('table', { class: 'ritmos' },
        el('thead', {}, el('tr', {}, el('th', { text: 'Etapa' }), el('th', { class: 'n', text: 'Meta' }), el('th', { class: 'n', text: 'Tempo da etapa' }), el('th', { class: 'n', text: 'Seu ritmo (4 sem.)' }), el('th', { class: 'n', text: 'Distância da meta' }))),
        el('tbody', {}, linhas))));
  }

  // contagem regressiva ao vivo até a largada
  let relogio = null;
  function contagemRegressiva(p) {
    const largada = new Date(p.largada || (p.data + 'T06:00:00-03:00'));
    const partes = ['dias', 'h', 'min', 's'].map((u) => [u, el('span', { class: 'v', text: '—' })]);
    const caixa = el('a', { class: 'contagem', href: '#prova-' + p.id },
      el('div', {}, el('div', { class: 'quando', text: 'Próxima prova' }), el('div', { class: 'qual', text: p.nome }),
        el('div', { class: 'quando', text: dataLonga(p.data) + '. Ver a preparação' }),
        metaProva(p) ? el('div', { class: 'meta-tempo' }, el('span', { class: 'quando', text: 'Meta ' }), el('b', { text: hms(metaProva(p).total) }),
          metaProva(p).transicoes ? null : el('span', { class: 'quando', text: ' + transições' })) : null),
      el('div', { class: 'relogio', role: 'timer', 'aria-label': 'Tempo até a largada' }, partes.map(([u, v]) => el('div', {}, v, el('small', { text: u })))));
    const tick = () => {
      if (!caixa.isConnected && relogio) { clearInterval(relogio); relogio = null; return; }
      let s = Math.max(0, Math.floor((largada - Date.now()) / 1000));
      const vals = [Math.floor(s / 86400), Math.floor(s % 86400 / 3600), Math.floor(s % 3600 / 60), s % 60];
      partes.forEach(([, v], i) => { v.textContent = i === 0 ? fmt(vals[i]) : String(vals[i]).padStart(2, '0'); });
    };
    tick();
    if (relogio) clearInterval(relogio);
    relogio = setInterval(tick, 1000);
    return caixa;
  }

  // provas concluídas com parciais oficiais e dados do relógio
  const PARCIAIS = [['natacao', 'Natação'], ['t1', 'T1'], ['bike', 'Bike'], ['t2', 'T2'], ['corrida', 'Corrida']];
  function resultados(lista, atividades) {
    const ord = [...lista].sort((a, b) => b.data.localeCompare(a.data));
    return el('div', { class: 'resultados' }, ord.map((r, i) => {
      const doDia = atividades.filter((a) => a.data === r.data && a.distancia_km);
      const corrida = doDia.filter((a) => a.tipo === 'Run').sort((a, b) => b.distancia_km - a.distancia_km)[0];
      const parc = r.parciais ? PARCIAIS.filter(([k]) => r.parciais[k]) : [];
      return el('details', { class: 'resultado', open: i === 0 ? '' : null },
        el('summary', {}, el('span', { class: 'pos', text: r.colocacao || '' }), el('span', { class: 'nome', text: r.prova }), el('span', { class: 'tempo', text: r.tempo })),
        el('div', { class: 'corpo' },
          el('p', { class: 'quando', text: [dataLonga(r.data), r.local].filter(Boolean).join(' · ') }),
          r.destaque ? el('p', { class: 'destaque', text: r.destaque }) : null,
          parc.length ? el('div', { class: 'parciais' }, parc.map(([k, n]) => el('div', { class: k.startsWith('t') ? 'transicao' : '' },
            el('span', { text: n + (r.distancias_parciais && r.distancias_parciais[k] ? ' ' + r.distancias_parciais[k] : '') }), el('b', { text: r.parciais[k] }))),
            el('div', { class: 'total' }, el('span', { text: 'Total' }), el('b', { text: r.tempo }))) : null,
          corrida ? el('p', { class: 'relogio-dados' }, 'Corrida pelo relógio: ', el('b', { text: ritmo(corrida) }), corrida.fc_media ? [' · FC média ', el('b', { text: String(corrida.fc_media) })] : null) : null));
    }));
  }

  // atividades recentes com filtros de período
  const CATEGORIAS = [['Run', 'Corrida', '#ffffff'], ['Ride', 'Bike', '#bdbdbd'], ['Swim', 'Natação', '#7d7d7d'], ['Strength', 'Musculação', '#4a4a4a'], ['Other', 'Outros', '#2a2a2a']];
  function atividadesRecentes(atividades) {
    const h = hojeISO(), seg = segunda(h);
    const periodos = [
      ['Esta semana', seg, h], ['Semana passada', somaDias(seg, -7), somaDias(seg, -1)],
      ['Este mês', h.slice(0, 8) + '01', h], ['Últimos 60 dias', somaDias(h, -59), h], ['No ano', h.slice(0, 4) + '-01-01', h]];
    const corpo = el('div', {});
    const botoes = periodos.map(([nome], i) => el('button', { type: 'button', class: 'filtro', 'aria-pressed': i === 0 ? 'true' : 'false', text: nome }));
    const mostrar = (i) => {
      botoes.forEach((b, j) => b.setAttribute('aria-pressed', i === j ? 'true' : 'false'));
      const [, de, ate] = periodos[i];
      const lista = atividades.filter((a) => a.data >= de && a.data <= ate);
      const tempo = soma(lista, (a) => a.tempo_min);
      const cats = CATEGORIAS.map(([k, n, c]) => ({ n, c, min: soma(lista.filter((a) => (CATEGORIAS.some(([kk]) => kk === a.tipo) ? a.tipo : 'Other') === k), (a) => a.tempo_min) })).filter((x) => x.min > 0);
      let todas = false;
      const tabela = el('div', {});
      const desenharTabela = () => {
        const vis = todas ? lista.slice().reverse() : lista.slice(-10).reverse();
        tabela.replaceChildren(...[tabelaTreinos(vis), lista.length > 10 && !todas ? el('button', { type: 'button', class: 'filtro mais', text: 'Mostrar todas as ' + lista.length + ' atividades' }) : null].filter(Boolean));
        const b = tabela.querySelector('.mais'); if (b) b.onclick = () => { todas = true; desenharTabela(); };
      };
      desenharTabela();
      corpo.replaceChildren(...[
        el('dl', { class: 'faixa' }, numero('Atividades', fmt(lista.length)), numero('Tempo total', horas(tempo)), numero('Distância', fmt(soma(lista.filter((a) => a.tipo !== 'Ride' || kmConfiavel(lista.filter((b) => b.tipo === 'Ride'), 'Ride')), (a) => a.distancia_km)), 'km', kmConfiavel(lista.filter((b) => b.tipo === 'Ride'), 'Ride') || !lista.some((b) => b.tipo === 'Ride') ? null : 'sem a bike, que está sem distância')),
        tempo ? el('div', { class: 'divisao' },
          el('div', { class: 'divisao-barra', role: 'img', 'aria-label': 'Divisão do tempo por esporte: ' + cats.map((x) => x.n + ' ' + fmt(x.min / tempo * 100, 1) + '%').join(', ') },
            cats.map((x) => el('i', { style: 'width:' + (x.min / tempo * 100).toFixed(2) + '%;background:' + x.c, title: x.n }))),
          el('ul', { class: 'divisao-lista' }, cats.map((x) => el('li', {}, el('i', { style: 'background:' + x.c }), el('span', { text: x.n }),
            el('b', { text: fmt(x.min / tempo * 100, 1) + '%' }), el('span', { class: 'h', text: horas(x.min) }))))) : null,
        tabela].filter(Boolean));
    };
    botoes.forEach((b, i) => { b.onclick = () => mostrar(i); });
    mostrar(0);
    return el('div', {}, el('div', { class: 'filtros', role: 'group', 'aria-label': 'Período' }, botoes), corpo);
  }
  function secao(titulo, nota, ...filhos) {
    return el('section', { class: 'secao' }, el('h2', { text: titulo }), nota ? el('p', { class: 'nota', text: nota }) : null, ...filhos);
  }
  function tabelaTreinos(lista) {
    if (!lista.length) return el('p', { class: 'vazio', text: 'Nenhum treino neste período.' });
    return el('div', { class: 'tabela-wrap' }, el('table', {},
      el('thead', {}, el('tr', {}, el('th', { text: 'Data' }), el('th', { text: 'Treino' }), el('th', { text: 'Esporte' }), el('th', { class: 'n', text: 'Distância' }), el('th', { class: 'n', text: 'Tempo' }), el('th', { class: 'n', text: 'Ritmo' }))),
      el('tbody', {}, lista.map((a) => el('tr', {},
        el('td', { text: dataCurta(a.data) }), el('td', { text: a.nome }), el('td', { text: (ESPORTES[a.tipo] || { nome: 'Outro' }).nome }),
        el('td', { class: 'n', text: a.tipo === 'Swim' ? fmt(a.distancia_km * 1000) + ' m' : fmt(a.distancia_km, 1) + ' km' }),
        el('td', { class: 'n', text: horas(a.tempo_min) }), el('td', { class: 'n', text: ritmo(a) })))))); 
  }
  function proximaProva(provas) {
    const h = hojeISO();
    return provas.filter((p) => p.data >= h).sort((a, b) => a.data.localeCompare(b.data))[0];
  }

  function paginaInicio(ctx) {
    const { site, atividades, provas } = ctx, h = hojeISO(), ano = h.slice(0, 4);
    const doAno = atividades.filter((a) => a.data.startsWith(ano));
    const km = (tipo) => soma(doAno.filter((a) => a.tipo === tipo), (a) => a.distancia_km);
    const frag = document.createDocumentFragment();

    const textoHero = el('div', { class: 'hero-texto' },
      el('h1', { class: 'titulo', text: site.nome }),
      site.equipe ? el('p', { class: 'equipe', text: site.equipe }) : null,
      el('p', { class: 'sub' }, site.subtitulo + ' Em ' + ano + ': ', el('b', { text: horas(soma(doAno, (a) => a.tempo_min)) }), ' de treino em ', el('b', { text: fmt(doAno.length) }), ' sessões.'));
    // uma foto: ao lado do nome. Duas fotos: uma de cada lado, como uma capa.
    const fotos = (site.fotos && site.fotos.length ? site.fotos : site.foto ? [{ src: site.foto, alt: site.foto_alt }] : []).slice(0, 2);
    const figura = (f) => el('figure', { class: 'hero-foto' }, el('img', { src: f.src, alt: f.alt || ('Foto de ' + site.nome), loading: 'eager', decoding: 'async' }),
      f.legenda ? el('figcaption', { text: f.legenda }) : null);
    if (fotos.length === 2) frag.append(el('div', { class: 'hero hero-duplo' }, figura(fotos[0]), textoHero, figura(fotos[1])));
    else if (fotos.length === 1) frag.append(el('div', { class: 'hero' }, textoHero, figura(fotos[0])));
    else frag.append(textoHero);

    // números de toda a história, com comparações
    const kmTotal = soma(atividades, (a) => a.distancia_km), minTotal = soma(atividades, (a) => a.tempo_min), subida = soma(atividades, (a) => a.elevacao_m);
    const diasTreino = new Set(doAno.map((a) => a.data)).size, diasAno = diasEntre(ano + '-01-01', h) + 1;
    const inicioHist = atividades.length ? atividades[0].data : h;
    const descanso = diasEntre(inicioHist > ano + '-01-01' ? inicioHist : ano + '-01-01', h) + 1 - diasTreino;
    const voltas = kmTotal / 40075, orbitas = minTotal / 92.7, everests = subida / 8849;
    frag.append(el('dl', { class: 'faixa grande' },
      numero('Treinos', fmt(atividades.length), null, fmt(Math.max(0, descanso)) + ' dias de descanso em ' + ano + (inicioHist > ano + '-01-01' ? ', desde o primeiro treino' : '')),
      numero('Quilômetros', fmt(kmTotal), 'km', voltas >= 1 ? fmt(voltas, 2) + ' voltas na Terra' : fmt(voltas * 100, 1) + '% de uma volta na Terra'),
      numero('Horas', horas(minTotal), null, fmt(orbitas, 0) + ' voltas da Estação Espacial'),
      numero('Subida acumulada', fmt(subida), 'm', fmt(everests, 1) + ' Everests do nível do mar ao cume')));

    const p = proximaProva(provas);
    if (p) frag.append(contagemRegressiva(p));

    // apresentação
    const apr = site.apresentacao;
    if (apr && (apr.paragrafos || []).length) frag.append(secao(apr.titulo || 'Apresentação', null, el('div', { class: 'apresentacao' },
      apr.paragrafos.map((t) => el('p', { text: t })),
      apr.citacao ? el('blockquote', {}, el('p', { text: apr.citacao.texto }), apr.citacao.autor ? el('cite', { text: apr.citacao.autor }) : null) : null,
      apr.assinatura ? el('p', { class: 'assinatura' }, el('b', { text: site.nome }), el('br'), apr.assinatura) : null)));

    frag.append(el('dl', { class: 'faixa' },
      numero('Natação em ' + ano, fmt(km('Swim'), 1), 'km'), (kmConfiavel(doAno.filter((a) => a.tipo === 'Ride'), 'Ride') ? numero('Bike em ' + ano, fmt(km('Ride')), 'km') : numero('Bike em ' + ano, horas(soma(doAno.filter((a) => a.tipo === 'Ride'), (a) => a.tempo_min)), null, 'em horas: a maioria dos pedais é no rolo, sem distância')),
      numero('Corrida em ' + ano, fmt(km('Run')), 'km'), numero('Treinos em ' + ano, fmt(doAno.length))));

    // horas por mês
    const meses = [];
    for (let i = 11; i >= 0; i--) {
      const d = new Date(Date.UTC(+ano, +h.slice(5, 7) - 1 - i, 1)), k = d.toISOString().slice(0, 7);
      const doMes = atividades.filter((a) => a.data.startsWith(k));
      const linhaMes = { chave: k, rotulo: MESES[+k.slice(5, 7) - 1] + ' ' + k.slice(0, 4) };
      ORDEM.forEach((e) => { linhaMes[e] = Math.round(soma(doMes.filter((a) => a.tipo === e), (a) => a.tempo_min) / 6) / 10; });
      meses.push(linhaMes);
    }
    const boxMes = el('div', { class: 'grafico' });
    frag.append(secao('Horas por mês', 'Últimos 12 meses, somando natação, bike e corrida.', legenda(ORDEM), boxMes));

    // recordes
    const rec = new Map();
    (site.provas_concluidas || []).forEach((x) => { const a = rec.get(x.distancia); if (!a || segs(x.tempo) < segs(a.tempo)) rec.set(x.distancia, x); });
    if (rec.size) frag.append(secao('Recordes pessoais', null, el('div', { class: 'recordes' },
      [...rec.values()].map((r) => el('div', { class: 'recorde' }, el('div', { class: 'd', text: r.distancia }), el('div', { class: 't', text: r.tempo }), el('div', { class: 'onde', text: r.prova + ', ' + r.data.slice(5, 7) + '/' + r.data.slice(0, 4) }))))));

    const concluidas = site.provas_concluidas || [];
    if (concluidas.length) frag.append(secao('Provas', 'Resultados oficiais, com as parciais de cada etapa.', resultados(concluidas, atividades)));

    frag.append(secao('Atividades recentes', null, atividadesRecentes(atividades)));
    const geo = secaoGeografia(atividades, ctx.locais, ctx.lugares); if (geo) frag.append(geo);
    $('#conteudo').replaceChildren(frag);
    agendar(boxMes, () => barrasEmpilhadas(boxMes, meses, { unidade: 'h', fmtX: (k) => MESES[+k.slice(5, 7) - 1], alt: 'Barras empilhadas com as horas de natação, bike e corrida em cada um dos últimos 12 meses' }));
  }

  function paginaProva(ctx, prova) {
    const { atividades } = ctx, h = hojeISO();
    const fim = prova.data < h ? prova.data : h;
    const doCiclo = atividades.filter((a) => a.data >= prova.inicio_ciclo && a.data <= prova.data);
    const esportes = ORDEM.filter((e) => prova.metas && prova.metas[e]);
    const semanaAtual = segunda(h);
    const daSemana = doCiclo.filter((a) => segunda(a.data) === semanaAtual);
    const kmDe = (lista, e) => soma(lista.filter((a) => a.tipo === e), (a) => a.distancia_km);
    // esportes com meta em horas (ex.: bike no rolo sem sensor de velocidade) são medidos em horas, não em km
    const emHoras = (e) => prova.metas[e] && prova.metas[e].semanal_h != null;
    const volDe = (lista, e) => emHoras(e) ? soma(lista.filter((a) => a.tipo === e), (a) => a.tempo_min) / 60 : kmDe(lista, e);
    const un = (e) => emHoras(e) ? 'h' : 'km';
    const metaSem = (e) => emHoras(e) ? prova.metas[e].semanal_h : prova.metas[e].semanal_km;
    const metaMaior = (e) => emHoras(e) ? prova.metas[e].maior_h : prova.metas[e].maior_km;
    const dias = diasEntre(h, prova.data);

    // bricks: bike e corrida no mesmo dia
    const porDia = d3.group(doCiclo, (a) => a.data);
    const bricks = [...porDia.values()].filter((l) => l.some((a) => a.tipo === 'Ride') && l.some((a) => a.tipo === 'Run')).length;

    const frag = document.createDocumentFragment();
    frag.append(el('h1', { class: 'titulo', style: 'font-size:clamp(48px,11vw,132px)', text: prova.nome }));

    // período base: antes do início do ciclo, mostra a base em vez das metas do ciclo
    if (prova.base && h < prova.inicio_ciclo) {
      const daBase = atividades.filter((a) => a.data >= prova.base.inicio && a.data <= h);
      const semanasBase = Math.max(1, Math.ceil((diasEntre(prova.base.inicio, h) + 1) / 7));
      const faltam = Math.ceil(diasEntre(h, prova.inicio_ciclo) / 7);
      frag.append(el('p', { class: 'sub' }, [el('b', { text: fmt(dias) }), ' dias para a largada, em ' + dataLonga(prova.data) + '. ',
        'Agora: período base, com foco em ' + prova.base.foco + '. A preparação específica começa em ' + dataLonga(prova.inicio_ciclo) + ', daqui a ' + fmt(faltam) + ' semanas.']));
      frag.append(el('dl', { class: 'faixa' },
        numero('Semanas de base', fmt(semanasBase)),
        numero('Horas na base', horas(soma(daBase, (a) => a.tempo_min))),
        numero('Treinos na base', fmt(daBase.length)),
        numero('Semanas até o ciclo', fmt(faltam))));
      const rb = secaoRitmos(prova, atividades); if (rb) frag.append(rb);
      frag.append(secao('Média por semana na base', 'Desde ' + dataLonga(prova.base.inicio) + '. Para comparar com a meta do ciclo, que começa depois.',
        el('div', { class: 'metas' }, esportes.map((e) => {
          const v = volDe(daBase, e) / semanasBase, alvo = metaSem(e);
          return el('div', { class: 'meta-linha' }, el('span', { class: 'esporte', text: ESPORTES[e].nome }),
            el('div', { class: 'barra' }, el('i', { style: 'width:' + Math.min(100, alvo ? v / alvo * 100 : 0).toFixed(1) + '%' })),
            el('span', { class: 'valor' }, el('b', { text: fmt(v, 1) }), ' ' + un(e) + '/sem. Meta do ciclo: ' + fmt(alvo, emHoras(e) ? 1 : 0) + ' ' + un(e)));
        }))));
      frag.append(secao('Treinos da base', null, tabelaTreinos(daBase.slice(-12).reverse())));
      $('#conteudo').replaceChildren(frag);
      return;
    }
    const resumoSemana = esportes.map((e) => fmt(volDe(daSemana, e), e === 'Swim' || emHoras(e) ? 1 : 0) + ' ' + un(e) + ' de ' + ESPORTES[e].nome.toLowerCase());
    frag.append(el('p', { class: 'sub' }, dias >= 0 ? [el('b', { text: fmt(dias) }), ' dias para a largada, em ' + dataLonga(prova.data) + '. '] : 'Prova realizada em ' + dataLonga(prova.data) + '. ',
      'Nesta semana: ' + resumoSemana.join(', ').replace(/, ([^,]*)$/, ' e $1') + '.'));
    frag.append(el('dl', { class: 'faixa' },
      numero('Semanas de ciclo', fmt(Math.max(0, Math.ceil((diasEntre(prova.inicio_ciclo, fim) + 1) / 7)))),
      numero('Horas no ciclo', horas(soma(doCiclo, (a) => a.tempo_min))),
      numero('Treinos no ciclo', fmt(doCiclo.length)),
      esportes.includes('Ride') && esportes.includes('Run') ? numero('Bricks', fmt(bricks)) : null));
    const rc = secaoRitmos(prova, atividades); if (rc) frag.append(rc);

    const barra = (v, alvo) => el('div', { class: 'barra' }, el('i', { style: 'width:' + Math.min(100, alvo ? v / alvo * 100 : 0).toFixed(1) + '%' }));
    frag.append(secao('Metas da semana', 'Semana de ' + dataCurta(semanaAtual) + ' a ' + dataCurta(somaDias(semanaAtual, 6)) + '.',
      el('div', { class: 'metas' }, esportes.map((e) => {
        const v = volDe(daSemana, e), alvo = metaSem(e);
        return el('div', { class: 'meta-linha' }, el('span', { class: 'esporte', text: ESPORTES[e].nome }), barra(v, alvo),
          el('span', { class: 'valor' }, el('b', { text: fmt(v, e === 'Swim' || emHoras(e) ? 1 : 0) }), ' de ' + fmt(alvo, emHoras(e) ? 1 : 0) + ' ' + un(e)));
      }))));

    frag.append(secao('Treino mais longo do ciclo', 'Comparado com a meta e com a distância da prova.',
      el('div', { class: 'metas' }, esportes.map((e) => {
        const maior = d3.max(doCiclo.filter((a) => a.tipo === e), (a) => emHoras(e) ? a.tempo_min / 60 : a.distancia_km) || 0;
        const alvo = metaMaior(e), dist = (prova.distancias || {})[e];
        return el('div', { class: 'meta-linha' }, el('span', { class: 'esporte', text: ESPORTES[e].nome }), barra(maior, alvo),
          el('span', { class: 'valor' }, el('b', { text: fmt(maior, 1) }), ' de ' + fmt(alvo, 1) + ' ' + un(e) + (dist ? '. Na prova: ' + fmt(dist, 1) + ' km' : '')));
      }))));

    // volume semanal por esporte
    const semanas = [];
    for (let s = segunda(prova.inicio_ciclo); s <= segunda(fim); s = somaDias(s, 7)) semanas.push(s);
    const multiplos = el('div', { class: 'multiplos' });
    const caixas = esportes.map((e) => {
      const box = el('div', { class: 'grafico' });
      multiplos.append(el('div', {}, el('h3', { text: ESPORTES[e].nome }), box));
      const linhas = semanas.map((s) => ({ chave: s, rotulo: 'Semana de ' + dataCurta(s), [e]: Math.round(volDe(doCiclo.filter((a) => segunda(a.data) === s), e) * 10) / 10 }));
      return [box, () => barrasEmpilhadas(box, linhas, { unidade: un(e), esportes: [e], meta: metaSem(e), fmtX: dataCurta, alt: 'Barras com o volume de ' + ESPORTES[e].nome.toLowerCase() + ' em cada semana do ciclo e linha tracejada na meta semanal' })];
    });
    frag.append(secao('Volume por semana', 'Desde o início do ciclo, em ' + dataCurta(prova.inicio_ciclo) + '/' + prova.inicio_ciclo.slice(0, 4) + '. A linha tracejada é a meta semanal.', semanas.length ? multiplos : el('p', { class: 'vazio', text: 'O ciclo começa em ' + dataLonga(prova.inicio_ciclo) + '.' })));

    frag.append(secao('Treinos do ciclo', null, tabelaTreinos(doCiclo.slice(-12).reverse())));
    $('#conteudo').replaceChildren(frag);
    if (semanas.length) caixas.forEach(([box, fn]) => agendar(box, fn));
  }

  function paginaRecuperacao(ctx) {
    const be = ctx.bemEstar.slice(-90);
    const frag = document.createDocumentFragment();
    frag.append(el('h1', { class: 'titulo', text: 'Recuperação' }));
    if (!be.length) {
      frag.append(el('p', { class: 'sub', text: 'Ainda não há dados de sono e HRV. No Intervals.icu, marque "Download wellness data" na conexão com o Garmin.' }));
      $('#conteudo').replaceChildren(frag); return;
    }
    const serie = be.map((d, i) => {
      const jan = be.slice(Math.max(0, i - 6), i + 1).filter((x) => x.hrv != null);
      return Object.assign({}, d, { hrv7: jan.length ? d3.mean(jan, (x) => x.hrv) : null, forma: d.ctl != null && d.atl != null ? d.ctl - d.atl : null });
    });
    const u = serie[serie.length - 1];
    const forma = u.forma;
    const leitura = forma == null ? '' : forma <= -20 ? 'Fadiga alta: vale priorizar o descanso.' : forma < -5 ? 'Carga produtiva: você está construindo fitness.' : forma <= 10 ? 'Equilibrado.' : 'Descansado: bom momento para prova ou teste.';
    frag.append(el('p', { class: 'sub' }, 'Noite de ' + dataCurta(u.data) + ': ', ...(u.sono_h != null ? [el('b', { text: horas(u.sono_h * 60) }), ' de sono e HRV de '] : ['sono ainda não registrado; HRV de ']),
      el('b', { text: fmt(u.hrv) }), ' ms, contra média de 7 dias de ', el('b', { text: fmt(u.hrv7) }), ' ms. ', leitura));
    frag.append(el('dl', { class: 'faixa' },
      numero('Sono', u.sono_h != null ? horas(u.sono_h * 60) : '—'), numero('HRV', fmt(u.hrv), 'ms'),
      numero('FC de repouso', fmt(u.fc_repouso), 'bpm'), numero('Forma', forma == null ? '—' : (forma > 0 ? '+' : '') + fmt(forma))));

    // sono em destaque: média das últimas 7 e 30 noites contra a meta
    const metaSono = ctx.site.meta_sono || 7;
    const noites = ctx.bemEstar.filter((w) => w.sono_h);
    const ult7 = noites.slice(-7), ult30 = noites.slice(-30);
    if (ult7.length) {
      const m7 = d3.mean(ult7, (w) => w.sono_h), m30 = d3.mean(ult30, (w) => w.sono_h);
      const naMeta = ult30.filter((w) => w.sono_h >= metaSono).length, curtas = ult30.filter((w) => w.sono_h < 6).length;
      const falta = Math.max(0, (metaSono - m7) * 7);
      frag.append(secao('Sono', 'Meta: ' + metaSono + ' horas por noite. É o que mais pesa na recuperação.',
        el('dl', { class: 'faixa' },
          numero('Média 7 noites', horas(m7 * 60), null, falta > 0 ? 'faltam ' + horas(falta * 60) + ' na semana para a meta' : 'na meta'),
          numero('Média 30 noites', horas(m30 * 60)),
          numero('Noites na meta', fmt(naMeta), 'de ' + ult30.length, '' + metaSono + 'h ou mais, últimos 30 dias'),
          numero('Noites curtas', fmt(curtas), 'de ' + ult30.length, 'menos de 6h, últimos 30 dias')),
        el('div', { class: 'cumprido sono-barra' },
          el('div', { class: 'cumprido-cab' }, el('span', { text: 'Média de 7 noites contra a meta' }), el('b', { text: Math.round(m7 / metaSono * 100) + '%' })),
          el('div', { class: 'barra' }, el('i', { style: 'width:' + Math.min(100, m7 / metaSono * 100).toFixed(1) + '%' })))));
    }

    const b1 = el('div', { class: 'grafico' }), b2 = el('div', { class: 'grafico' }), b3 = el('div', { class: 'grafico' });
    const leg = (itens) => el('ul', { class: 'legenda' }, itens.map(([estilo, t]) => el('li', {}, el('i', { style: estilo }), t)));
    frag.append(secao('Fitness, fadiga e forma', 'Fitness é a carga média dos últimos 42 dias, fadiga a dos últimos 7. Forma é a diferença: negativa quando você está carregado.',
      leg([['background:#fff', 'Fitness'], ['background:transparent;border-top:2px dashed #9a9a9a;height:0', 'Fadiga'], ['background:#3a3a3a', 'Forma']]), b1));
    frag.append(secao('HRV noturno', 'Cada ponto é uma noite. A linha é a média de 7 dias.', b2));
    frag.append(secao('Horas de sono', 'Barras brancas: noites com ' + metaSono + ' horas ou mais. A linha tracejada marca a meta.', b3));
    $('#conteudo').replaceChildren(frag);

    agendar(b1, () => linhasTempo(b1, serie, {
      campos: ['ctl', 'atl', 'forma'], alt: 'Linhas de fitness e fadiga e barras de forma nos últimos 90 dias',
      dicaTexto: (d) => ['Fitness ' + fmt(d.ctl, 1), 'Fadiga ' + fmt(d.atl, 1), 'Forma ' + fmt(d.forma, 1)],
      desenhar: (svg, dados, x, y) => {
        const bw = Math.max(1, (x.range()[1] - x.range()[0]) / dados.length - 1);
        svg.append('g').selectAll('rect').data(dados.filter((d) => d.forma != null)).join('rect').attr('fill', '#3a3a3a')
          .attr('x', (d) => x(d.t) - bw / 2).attr('width', bw).attr('y', (d) => Math.min(y(0), y(d.forma))).attr('height', (d) => Math.abs(y(0) - y(d.forma)));
        linha(svg, dados, x, y, 'atl', '#9a9a9a', true); linha(svg, dados, x, y, 'ctl', '#fff');
      },
    }));
    agendar(b2, () => linhasTempo(b2, serie.filter((d) => d.hrv != null), {
      campos: ['hrv', 'hrv7'], alt: 'Pontos com o HRV de cada noite e linha com a média de 7 dias',
      dicaTexto: (d) => ['HRV ' + fmt(d.hrv) + ' ms', 'Média 7 dias ' + fmt(d.hrv7, 1) + ' ms'],
      desenhar: (svg, dados, x, y) => {
        svg.append('g').selectAll('circle').data(dados).join('circle').attr('cx', (d) => x(d.t)).attr('cy', (d) => y(d.hrv)).attr('r', 2.5).attr('fill', '#5a5a5a');
        linha(svg, dados, x, y, 'hrv7', '#fff');
      },
    }));
    agendar(b3, () => linhasTempo(b3, serie.filter((d) => d.sono_h != null), {
      campos: ['sono_h'], dominio: (v) => [0, Math.max(9, d3.max(v))], fmtY: (v) => v + 'h', alt: 'Barras com as horas de sono de cada noite',
      dicaTexto: (d) => [horas(d.sono_h * 60) + ' de sono'],
      desenhar: (svg, dados, x, y) => {
        const bw = Math.max(1, (x.range()[1] - x.range()[0]) / dados.length - 1);
        svg.append('g').selectAll('rect').data(dados).join('rect').attr('x', (d) => x(d.t) - bw / 2).attr('width', bw)
          .attr('y', (d) => y(d.sono_h)).attr('height', (d) => y(0) - y(d.sono_h)).attr('fill', (d) => d.sono_h >= metaSono ? '#fff' : '#4a4a4a');
        svg.append('line').attr('x1', x.range()[0]).attr('x2', x.range()[1]).attr('y1', y(metaSono)).attr('y2', y(metaSono)).attr('stroke', '#fff').attr('stroke-dasharray', '4 4');
      },
    }));
  }

  // ---------- geografia: globo 3D (MapLibre), locais arredondados a ~11 km e percursos sem 500 m nas pontas ----------
  const distanciaKm = (a, b) => {
    const r = Math.PI / 180, dLat = (b[0] - a[0]) * r, dLng = (b[1] - a[1]) * r;
    const h = Math.sin(dLat / 2) ** 2 + Math.cos(a[0] * r) * Math.cos(b[0] * r) * Math.sin(dLng / 2) ** 2;
    return 2 * 6371 * Math.asin(Math.sqrt(h));
  };
  const chaveLocal = (p) => p[0].toFixed(1) + ',' + p[1].toFixed(1);
  const coord = (p) => fmt(Math.abs(p[0]), 1) + '°' + (p[0] < 0 ? 'S' : 'N') + ', ' + fmt(Math.abs(p[1]), 1) + '°' + (p[1] < 0 ? 'O' : 'L');
  const MAPLIBRE = 'https://cdnjs.cloudflare.com/ajax/libs/maplibre-gl/5.7.2/';
  let maplibrePronto = null;
  const carregarMaplibre = () => maplibrePronto || (maplibrePronto = new Promise((ok, falha) => {
    const css = document.createElement('link');
    css.rel = 'stylesheet'; css.href = MAPLIBRE + 'maplibre-gl.min.css';
    document.head.append(css);
    const js = document.createElement('script');
    js.src = MAPLIBRE + 'maplibre-gl.min.js';
    js.onload = () => ok(window.maplibregl); js.onerror = falha;
    document.head.append(js);
  }));
  // mapa livre do OpenStreetMap, em tons de cinza e escurecido, num globo
  const ESTILO_GLOBO = {
    version: 8,
    projection: { type: 'globe' },
    sky: { 'sky-color': '#000000', 'horizon-color': '#3a3a3a', 'fog-color': '#1c1c1c', 'atmosphere-blend': ['interpolate', ['linear'], ['zoom'], 0, 1, 5, 1, 7, 0] },
    sources: { osm: { type: 'raster', tiles: ['https://tile.openstreetmap.org/{z}/{x}/{y}.png'], tileSize: 256, maxzoom: 19, attribution: '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>' } },
    layers: [
      { id: 'fundo', type: 'background', paint: { 'background-color': '#000' } },
      { id: 'osm', type: 'raster', source: 'osm', paint: { 'raster-saturation': -1, 'raster-brightness-min': 0, 'raster-brightness-max': 0.34, 'raster-contrast': 0.35 } },
    ],
  };

  function secaoGeografia(atividades, locais, lugares) {
    lugares = lugares || {};
    const grupos = new Map();
    for (const a of atividades) {
      const p = locais && locais[a.id];
      if (!p) continue;
      const k = chaveLocal(p);
      if (!grupos.has(k)) grupos.set(k, { k, p, lista: [] });
      grupos.get(k).lista.push(a);
    }
    if (!grupos.size) return null;
    const ordem = [...grupos.values()].sort((a, b) => b.lista.length - a.lista.length);
    const casa = ordem[0].p;
    const longe = ordem.reduce((m, g) => { const d = distanciaKm(casa, g.p); return d > m.d ? { d, g } : m; }, { d: 0, g: null });
    const nome = (g) => { const l = lugares[g.k]; return l && l.cidade ? l.cidade + (l.cc && l.cc !== 'BR' ? ', ' + l.pais : l.estado ? ', ' + l.estado : '') : coord(g.p); };
    const paises = new Set(ordem.map((g) => lugares[g.k] && lugares[g.k].cc).filter(Boolean));
    const totalGps = soma(ordem, (g) => g.lista.length);

    const mapa = el('div', { class: 'geo-mapa', role: 'application', 'aria-label': 'Globo com ' + ordem.length + ' locais de treino. Clique num ponto para ver os treinos e o percurso.' });
    const painel = el('div', { class: 'geo-painel' });
    const rodape = el('div', { class: 'geo-fatos' });
    const caixa = el('div', { class: 'geo' }, el('div', { class: 'geo-topo' }, mapa, painel), rodape);
    let map = null, marcadores = [];

    const lugarBotao = (g) => { const b = el('button', { type: 'button', class: 'geo-lugar' }, el('b', { text: fmt(g.lista.length) }), ' em ' + nome(g)); b.onclick = () => abrirLugar(g); return b; };
    rodape.append(
      el('p', { class: 'geo-rot', text: 'Onde mais treino' }),
      el('p', { class: 'geo-linha' }, ordem.slice(0, 4).map(lugarBotao)),
      el('p', { class: 'geo-rot', text: 'Fatos' }),
      el('p', { class: 'geo-linha' },
        el('span', {}, el('b', { text: fmt(ordem.length) }), ordem.length === 1 ? ' local' : ' locais diferentes'),
        paises.size ? el('span', {}, el('b', { text: fmt(paises.size) }), paises.size === 1 ? ' país' : ' países') : null,
        el('span', {}, el('b', { text: fmt(totalGps) }), ' treinos com GPS'),
        longe.g ? el('span', {}, 'Mais longe de casa: ', el('b', { text: fmt(longe.d) + ' km' }), ' (' + nome(longe.g) + ')') : null));

    const limparRota = () => { if (map && map.getSource('rota')) { map.removeLayer('rota-brilho'); map.removeLayer('rota'); map.removeSource('rota'); } };
    const inicio = () => {
      limparRota();
      painel.replaceChildren(
        el('p', { class: 'geo-rot', text: 'Geografia' }),
        el('h3', { text: 'Onde eu treino' }),
        el('p', { class: 'geo-txt', text: 'Gire o globo e clique num ponto para ver os treinos daquele lugar. Clique num treino para ver o percurso.' }),
        el('div', { class: 'geo-lista' }, ordem.slice(0, 8).map(lugarBotao)));
      if (map) map.flyTo({ center: [casa[1], casa[0]], zoom: 1.6, pitch: 0, bearing: 0, duration: 1600 });
    };
    function abrirLugar(g) {
      limparRota();
      const lista = [...g.lista].sort((a, b) => b.data.localeCompare(a.data));
      const voltar = el('button', { type: 'button', class: 'filtro', text: '← Voltar' }); voltar.onclick = inicio;
      painel.replaceChildren(
        el('p', { class: 'geo-rot', text: coord(g.p) }),
        el('h3', { text: nome(g) }),
        el('p', { class: 'geo-txt' }, el('b', { text: fmt(lista.length) }), lista.length === 1 ? ' treino' : ' treinos', ' · ', el('b', { text: fmt(soma(lista, (a) => a.distancia_km)) }), ' km'),
        el('div', { class: 'geo-lista' }, lista.slice(0, 40).map((a) => {
          const b = el('button', { type: 'button', class: 'geo-treino' },
            el('span', { class: 'd', text: dataCurta(a.data) + '/' + a.data.slice(2, 4) }), el('span', { class: 'n', text: a.nome }),
            el('span', { class: 'v', text: (ROTULO[a.tipo] || 'Outro') + ' · ' + (distTxt(a) || horas(a.tempo_min)) }));
          b.onclick = () => abrirTreino(a, g); return b;
        })),
        el('div', { class: 'geo-acoes' }, voltar));
      if (map) map.flyTo({ center: [g.p[1], g.p[0]], zoom: 10.5, pitch: 0, duration: 1800 });
    }
    async function abrirTreino(a, g) {
      const voltar = el('button', { type: 'button', class: 'filtro', text: '← ' + nome(g) }); voltar.onclick = () => abrirLugar(g);
      const dado = (v, r) => el('div', { class: 'geo-dado' }, el('b', { text: v }), el('span', { text: r }));
      const aviso = el('p', { class: 'geo-txt' });
      painel.replaceChildren(
        el('p', { class: 'geo-rot', text: dataLonga(a.data) }),
        el('h3', { text: a.nome }),
        el('div', { class: 'geo-dados' },
          dado(distTxt(a) || '—', 'distância'), dado(horas(a.tempo_min), 'tempo'),
          a.distancia_km ? dado(ritmo(a), a.tipo === 'Ride' ? 'velocidade média' : 'ritmo médio') : null,
          dado(fmt(a.elevacao_m) + ' m', 'subida'), a.fc_media ? dado(String(a.fc_media), 'FC média (bpm)') : null, a.carga ? dado(String(a.carga), 'carga (TSS)') : null),
        aviso,
        el('div', { class: 'geo-acoes' }, voltar));
      limparRota();
      let rota = [];
      try { rota = await carregar('data/rotas/' + a.id + '.json'); } catch (e) { rota = []; }
      if (!map) return;
      if (rota.length < 2) { aviso.textContent = 'Percurso curto demais para mostrar: o site esconde 500 m no começo e no fim de cada treino.'; return; }
      aviso.textContent = 'O percurso não mostra os primeiros nem os últimos 500 m, por privacidade.';
      const linha = { type: 'Feature', geometry: { type: 'LineString', coordinates: rota.map((p) => [p[1], p[0]]) } };
      map.addSource('rota', { type: 'geojson', data: linha });
      map.addLayer({ id: 'rota-brilho', type: 'line', source: 'rota', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 9, 'line-opacity': 0.18, 'line-blur': 4 } });
      map.addLayer({ id: 'rota', type: 'line', source: 'rota', layout: { 'line-join': 'round', 'line-cap': 'round' }, paint: { 'line-color': '#fff', 'line-width': 3 } });
      const lats = rota.map((p) => p[0]), lngs = rota.map((p) => p[1]);
      map.fitBounds([[Math.min(...lngs), Math.min(...lats)], [Math.max(...lngs), Math.max(...lats)]], { padding: 50, pitch: 45, duration: 1800, maxZoom: 15 });
    }

    inicio();
    carregarMaplibre().then((ml) => {
      if (!mapa.isConnected) return;
      map = new ml.Map({ container: mapa, style: ESTILO_GLOBO, center: [casa[1], casa[0]], zoom: 1.6, attributionControl: { compact: true }, maxPitch: 70 });
      map.addControl(new ml.NavigationControl({ visualizePitch: true }), 'top-right');
      mapa.mapa = map; // útil para inspecionar pelo console
      map.scrollZoom.disable(); // a página continua rolando; zoom pelos botões, pinça ou duplo clique
      const maior = ordem[0].lista.length;
      marcadores = ordem.map((g) => {
        const d = Math.round(22 + 30 * Math.sqrt(g.lista.length / maior));
        const elemento = el('button', { type: 'button', class: 'geo-ponto', 'aria-label': g.lista.length + ' treinos em ' + nome(g), text: String(g.lista.length), style: 'width:' + d + 'px;height:' + d + 'px;z-index:' + g.lista.length });
        elemento.onclick = (e) => { e.stopPropagation(); abrirLugar(g); };
        return new ml.Marker({ element: elemento }).setLngLat([g.p[1], g.p[0]]).addTo(map);
      });
    }).catch(() => { mapa.replaceChildren(el('p', { class: 'vazio', text: 'Não foi possível carregar o mapa agora.' })); });

    return secao('Geografia', 'Onde eu treino. Cada ponto junta os treinos num raio de uns 10 km.', caixa);
  }

  // ---------- calendário semanal ----------
  const DIAS_SEMANA = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
  const ROTULO = { Run: 'Corrida', Ride: 'Bike', Swim: 'Natação', Strength: 'Musculação', Other: 'Outro' };
  const semanaISO = (iso) => {
    const d = utc(iso); d.setUTCDate(d.getUTCDate() + 3 - ((d.getUTCDay() + 6) % 7));
    const jan4 = new Date(Date.UTC(d.getUTCFullYear(), 0, 4));
    return 1 + Math.round(((d - jan4) / 864e5 - 3 + ((jan4.getUTCDay() + 6) % 7)) / 7);
  };
  // km da bike só é confiável se todos os pedais têm distância (no rolo sem sensor não tem)
  const kmConfiavel = (lista, tipo) => tipo === 'Ride' ? lista.length > 0 && lista.every((a) => a.distancia_km > 0) : lista.some((a) => a.distancia_km > 0);
  const distTxt = (a) => !a.distancia_km ? null : a.tipo === 'Swim' ? fmt(a.distancia_km * 1000) + ' m' : fmt(a.distancia_km, 1) + ' km';

  function cartaoTreino(a) {
    const tipo = ROTULO[a.tipo] ? a.tipo : 'Other';
    return el('article', { class: 'treino t-' + tipo },
      el('header', {}, el('span', { class: 'esp', text: ROTULO[tipo] }), el('b', { text: horas(a.tempo_min) }), distTxt(a) ? el('span', { class: 'dist', text: distTxt(a) }) : null),
      el('div', { class: 'det' },
        a.fc_media ? el('span', {}, el('b', { text: String(a.fc_media) }), ' bpm') : null,
        a.distancia_km && tipo !== 'Strength' ? el('span', { text: ritmo(a) }) : null,
        a.carga != null ? el('span', { text: 'Carga ' + a.carga }) : null),
      el('p', { class: 'nome', text: a.nome }));
  }

  function cartaoPlanejado(p, feito) {
    const tipo = ROTULO[p.tipo] ? p.tipo : 'Other';
    return el('article', { class: 'treino planejado t-' + tipo + (feito ? ' feito' : ''), title: p.descricao || null },
      el('header', {}, el('span', { class: 'esp', text: (feito ? '✓ ' : '') + 'Planejado · ' + ROTULO[tipo] }),
        p.tempo_min ? el('b', { text: horas(p.tempo_min) }) : null, p.distancia_km ? el('span', { class: 'dist', text: distTxt(p) }) : null),
      p.carga ? el('div', { class: 'det' }, el('span', { text: 'TSS ' + p.carga })) : null,
      el('p', { class: 'nome', text: p.nome }),
      p.descricao ? el('p', { class: 'estrutura', text: p.descricao }) : null);
  }

  const NOMES_MES = ['Janeiro', 'Fevereiro', 'Março', 'Abril', 'Maio', 'Junho', 'Julho', 'Agosto', 'Setembro', 'Outubro', 'Novembro', 'Dezembro'];
  let mesCalendario = null;

  function paginaCalendario(ctx) {
    const { atividades, bemEstar } = ctx, planejados = ctx.planejados || [], h = hojeISO();
    const porDia = d3.group(atividades, (a) => a.data), planDia = d3.group(planejados, (p) => p.data);
    const be = new Map(bemEstar.map((w) => [w.data, w]));
    const mesMin = (atividades.length ? atividades[0].data : h).slice(0, 7);
    const ultimoPlan = planejados.length ? planejados[planejados.length - 1].data.slice(0, 7) : h.slice(0, 7);
    const mesMax = ultimoPlan > h.slice(0, 7) ? ultimoPlan : h.slice(0, 7);
    if (!mesCalendario || mesCalendario < mesMin || mesCalendario > mesMax) mesCalendario = h.slice(0, 7);
    const mudaMes = (k, n) => { const d = new Date(Date.UTC(+k.slice(0, 4), +k.slice(5, 7) - 1 + n, 1)); return d.toISOString().slice(0, 7); };

    const frag = document.createDocumentFragment();
    frag.append(el('h1', { class: 'titulo', text: 'Calendário' }));
    frag.append(el('p', { class: 'sub', text: 'O mês inteiro: treinos feitos, treinos planejados e a noite anterior de cada dia (sono, HRV e FC de repouso).' }));
    const area = el('div', { class: 'calendario' });
    frag.append(area);

    const semana = (seg, mes) => {
      const dias = [...Array(7)].map((_, i) => somaDias(seg, i));
      const doSem = dias.flatMap((d) => porDia.get(d) || []);
      const planSem = dias.flatMap((d) => planDia.get(d) || []);
      // cumprimento: TSS feito contra TSS planejado nos dias que já chegaram (até hoje)
      // hoje só entra na conta depois que algum treino do dia foi registrado
      const contaDia = (d) => d < h || (d === h && porDia.has(d));
      const planAteHoje = dias.filter(contaDia).flatMap((d) => planDia.get(d) || []);
      const tssPlanAteHoje = soma(planAteHoje, (p) => p.carga), tssFeito = soma(doSem, (a) => a.carga);
      const tssFeitoConta = soma(dias.filter(contaDia).flatMap((d) => porDia.get(d) || []), (a) => a.carga);
      const cumprido = tssPlanAteHoje ? Math.round(tssFeitoConta / tssPlanAteHoje * 100) : null;
      const ultimoBE = dias.map((d) => be.get(d)).filter((w) => w && w.ctl != null).pop();
      const porEsporte = ['Ride', 'Run', 'Swim', 'Strength', 'Other'].map((t) => {
        const l = doSem.filter((a) => (ROTULO[a.tipo] ? a.tipo : 'Other') === t);
        return { t, l, min: soma(l, (a) => a.tempo_min), km: soma(l, (a) => a.distancia_km), carga: soma(l, (a) => a.carga) };
      }).filter((x) => x.l.length);
      const resumo = el('aside', { class: 'sem-resumo' },
        el('h3', {}, 'Sem. ' + semanaISO(seg), el('small', { text: dataCurta(seg) + ' a ' + dataCurta(dias[6]) })),
        el('dl', {},
          el('div', {}, el('dt', { text: 'Feito' }), el('dd', { text: horas(soma(doSem, (a) => a.tempo_min)) })),
          el('div', {}, el('dt', { text: 'TSS feito' }), el('dd', { text: fmt(tssFeito) })),
          planSem.length ? el('div', {}, el('dt', { text: 'Plano' }), el('dd', { text: horas(soma(planSem, (p) => p.tempo_min)) })) : null,
          planSem.length ? el('div', {}, el('dt', { text: 'TSS plano' }), el('dd', { text: fmt(soma(planSem, (p) => p.carga)) })) : null,
          ultimoBE ? el('div', {}, el('dt', { text: 'Forma' }), el('dd', { text: fmt(ultimoBE.ctl - ultimoBE.atl) })) : null,
          ultimoBE ? el('div', {}, el('dt', { text: 'Fitness' }), el('dd', { text: fmt(ultimoBE.ctl) })) : null),
        cumprido != null ? el('div', { class: 'cumprido', title: 'TSS feito dividido pelo TSS planejado nos dias até hoje' },
          el('div', { class: 'cumprido-cab' }, el('span', { text: dias[6] < h ? 'Cumprido' : 'Cumprido até hoje' }), el('b', { text: cumprido + '%' })),
          el('div', { class: 'barra' }, el('i', { style: 'width:' + Math.min(100, cumprido) + '%' }))) : null,
        porEsporte.length ? el('table', { class: 'sem-esportes' },
          el('tbody', {}, porEsporte.map((x) => el('tr', {}, el('td', { text: ROTULO[x.t] }), el('td', { class: 'n', text: horas(x.min) }),
            el('td', { class: 'n', text: kmConfiavel(x.l, x.t) ? fmt(x.km, x.t === 'Swim' ? 1 : 0) + ' km' : '—' }), el('td', { class: 'n', text: x.carga ? String(Math.round(x.carga)) : '—' }))))) : null);
      const grade = el('div', { class: 'sem-dias' }, dias.map((d, i) => {
        const w = be.get(d), treinos = porDia.get(d) || [], plan = planDia.get(d) || [];
        // planejado de um dia passado só aparece se não houve treino do mesmo esporte (fica marcado como feito)
        const planCartoes = plan.map((p) => {
          const feito = treinos.some((a) => a.tipo === p.tipo);
          return d < h && feito ? null : cartaoPlanejado(p, false);
        }).filter(Boolean);
        const bem = w && (w.sono_h || w.hrv || w.fc_repouso) ? el('div', { class: 'bem' },
          w.sono_h ? el('span', { title: 'Sono' }, '☾ ', horas(w.sono_h * 60)) : null,
          w.hrv ? el('span', { title: 'HRV' }, '♥ ', fmt(w.hrv), ' ms') : null,
          w.fc_repouso ? el('span', { title: 'FC de repouso' }, fmt(w.fc_repouso), ' bpm') : null) : null;
        const vazio = !treinos.length && !planCartoes.length && !bem;
        return el('div', { class: 'dia' + (d === h ? ' hoje' : '') + (d > h ? ' futuro' : '') + (d.slice(0, 7) !== mes ? ' fora' : '') + (vazio ? ' sem-nada' : '') },
          el('div', { class: 'dia-cab' }, el('span', { class: 'dn', text: DIAS_SEMANA[i] }), ' ', dataCurta(d)),
          bem, treinos.map(cartaoTreino), planCartoes);
      }));
      return el('section', { class: 'semana' }, resumo, grade);
    };

    const desenhar = () => {
      const mes = mesCalendario, ini = mes + '-01', fim = somaDias(mudaMes(mes, 1) + '-01', -1);
      const doMes = atividades.filter((a) => a.data >= ini && a.data <= fim);
      const planMes = planejados.filter((p) => p.data >= ini && p.data <= fim);
      const btn = (txt, alvo, rotulo) => {
        const b = el('button', { type: 'button', class: 'filtro', text: txt, 'aria-label': rotulo });
        if (!alvo || alvo < mesMin || alvo > mesMax) b.disabled = true; else b.onclick = () => { mesCalendario = alvo; desenhar(); };
        return b;
      };
      const semanas = [];
      for (let s = segunda(ini); s <= fim; s = somaDias(s, 7)) semanas.push(s);
      semanas.reverse(); // semana mais recente primeiro
      // semanas futuras só aparecem se tiverem treino planejado
      const comPlano = (seg) => [...Array(7)].some((_, i) => planDia.has(somaDias(seg, i)));
      for (let i = semanas.length - 1; i >= 0; i--) if (semanas[i] > segunda(h) && !comPlano(semanas[i])) semanas.splice(i, 1);
      area.replaceChildren(
        el('div', { class: 'mes-nav' },
          btn('‹', mudaMes(mes, -1), 'Mês anterior'),
          el('h2', { text: NOMES_MES[+mes.slice(5, 7) - 1] + ' ' + mes.slice(0, 4) }),
          btn('›', mudaMes(mes, 1), 'Próximo mês'),
          mes !== h.slice(0, 7) ? btn('Hoje', h.slice(0, 7), 'Voltar para o mês atual') : null,
          el('p', { class: 'mes-total' }, el('b', { text: fmt(doMes.length) }), ' treinos · ', el('b', { text: horas(soma(doMes, (a) => a.tempo_min)) }),
            ' · ', el('b', { text: fmt(soma(doMes, (a) => a.distancia_km)) }), ' km',
            planMes.length ? [' · ', el('b', { text: fmt(planMes.length) }), ' planejados'] : null)),
        ...semanas.map((s) => semana(s, mes)));
    };
    desenhar();
    $('#conteudo').replaceChildren(frag);
  }

  // ---------- navegação ----------
  function rotear(ctx) {
    desenhos = [];
    const alvo = location.hash.slice(1);
    const prova = ctx.provas.find((p) => 'prova-' + p.id === alvo);
    const atual = prova ? alvo : ['recuperacao', 'calendario'].includes(alvo) ? alvo : 'inicio';
    document.querySelectorAll('#abas a').forEach((a) => { if (a.getAttribute('href') === '#' + atual) a.setAttribute('aria-current', 'page'); else a.removeAttribute('aria-current'); });
    if (prova) { document.title = prova.nome + ' · ' + ctx.site.nome; paginaProva(ctx, prova); }
    else if (atual === 'calendario') { document.title = 'Calendário · ' + ctx.site.nome; paginaCalendario(ctx); }
    else if (atual === 'recuperacao') { document.title = 'Recuperação · ' + ctx.site.nome; paginaRecuperacao(ctx); }
    else { document.title = ctx.site.nome; paginaInicio(ctx); }
    window.scrollTo(0, 0);
    ajustarTitulos();
  }

  // Diminui o título até a palavra mais longa caber na largura, sem quebrar no meio da palavra.
  function ajustarTitulos() {
    document.querySelectorAll('.titulo').forEach((t) => {
      t.style.fontSize = '';
      let fs = parseFloat(getComputedStyle(t).fontSize);
      while (t.scrollWidth > t.clientWidth + 1 && fs > 28) { fs -= 2; t.style.fontSize = fs + 'px'; }
    });
  }
  if (document.fonts && document.fonts.ready) document.fonts.ready.then(ajustarTitulos);
  let esperaTitulo; window.addEventListener('resize', () => { clearTimeout(esperaTitulo); esperaTitulo = setTimeout(ajustarTitulos, 120); });

  async function iniciar() {
    try {
      const [site, provas, atividades, bemEstar, meta, planejadosSync, planejadosManual, locais, lugares] = await Promise.all([
        carregar('config/site.json'), carregar('config/provas.json'), carregar('data/atividades.json'),
        carregar('data/bem_estar.json'), carregar('data/meta.json').catch(() => ({})), carregar('data/planejados.json').catch(() => []), carregar('config/planejados.json').catch(() => []), carregar('data/locais.json').catch(() => ({})), carregar('data/lugares.json').catch(() => ({})),
      ]);
      atividades.sort((a, b) => a.data.localeCompare(b.data));
      bemEstar.sort((a, b) => (a.data || '').localeCompare(b.data || ''));
      // planejados: os do Intervals.icu/TrainingPeaks (sync) + os que você envia à mão em config/planejados.json
      const planejados = [...planejadosSync, ...planejadosManual.map((p) => ({ fonte: 'Garmin', ...p }))].filter((p) => p && p.data);
      planejados.sort((a, b) => a.data.localeCompare(b.data));
      const ctx = { site, provas, atividades, bemEstar, meta, planejados, locais, lugares };

      const h = hojeISO();
      const ativas = provas.filter((p) => p.data >= h || diasEntre(p.data, h) <= 30).sort((a, b) => a.data.localeCompare(b.data));
      $('#abas').replaceChildren(
        el('a', { href: '#inicio', text: 'Início' }),
        el('a', { href: '#calendario', text: 'Calendário' }),
        ...ativas.map((p) => el('a', { href: '#prova-' + p.id, text: p.nome.replace(/^IRONMAN /i, '') })),
        el('a', { href: '#recuperacao', text: 'Recuperação' }));
      if (meta.exemplo) { $('#aviso').hidden = false; $('#aviso').textContent = 'Estes são dados de exemplo. Eles serão trocados pelos seus na primeira sincronização com o Intervals.icu.'; }
      if (meta.atualizado_em) $('#rodape').textContent = 'Dados do Garmin via ' + (meta.fonte || 'Intervals.icu') + '. Atualizado em ' + new Date(meta.atualizado_em).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' }) + '.';

      window.addEventListener('hashchange', () => rotear(ctx));
      rotear(ctx);
    } catch (e) {
      $('#conteudo').replaceChildren(el('p', { class: 'vazio', text: 'Não foi possível carregar os dados: ' + e.message + '. Confira se a pasta data/ tem os arquivos atividades.json e bem_estar.json.' }));
    }
  }
  iniciar();
})();
