/* Bolão da Copa 2026 — FG  |  App PWA (React + Supabase)
   Backend compartilhado: Supabase. Tempo real entre todos os celulares.
   Os placares reais podem ser lançados manualmente (qualquer um) ou importados
   do feed gratuito openfootball (best-effort, fase de grupos). */

const { useState, useEffect, useMemo, useRef, useCallback } = React;

// ---------- Tema ----------
const C = {
  bg: "#0a0e1a", card: "#141b2e", card2: "#1b2440", line: "#283456",
  txt: "#e8edf5", mut: "#8b96ab", green: "#00d97e", gold: "#ffcb05",
  blue: "#3b82f6", danger: "#ff5470", purple: "#9b6bff",
};
const DEFAULT_CFG = { pExact: 10, pDiff: 5, pWin: 3, cravadaBase: 10, unit: "R$", gruposTravado: false, mataAbre: null, deadlineMata: null };

const ADMINS = ["pl_thiago", "pl_eduardo"]; // quem pode lançar resultados (Dr. Thiago e Eduardo)
const FLAGS = {
  "México":"🇲🇽","África do Sul":"🇿🇦","Coreia do Sul":"🇰🇷","República Tcheca":"🇨🇿","Canadá":"🇨🇦",
  "Bósnia-Herzegovina":"🇧🇦","Catar":"🇶🇦","Suíça":"🇨🇭","Estados Unidos":"🇺🇸","Paraguai":"🇵🇾",
  "Austrália":"🇦🇺","Turquia":"🇹🇷","Brasil":"🇧🇷","Marrocos":"🇲🇦","Haiti":"🇭🇹","Escócia":"🏴󠁧󠁢󠁳󠁣󠁴󠁿",
  "Alemanha":"🇩🇪","Curaçao":"🇨🇼","Holanda":"🇳🇱","Japão":"🇯🇵","Costa do Marfim":"🇨🇮","Equador":"🇪🇨",
  "Suécia":"🇸🇪","Tunísia":"🇹🇳","Espanha":"🇪🇸","Cabo Verde":"🇨🇻","Bélgica":"🇧🇪","Egito":"🇪🇬",
  "Arábia Saudita":"🇸🇦","Uruguai":"🇺🇾","Irã":"🇮🇷","Nova Zelândia":"🇳🇿","Argentina":"🇦🇷","Argélia":"🇩🇿",
  "França":"🇫🇷","Senegal":"🇸🇳","Iraque":"🇮🇶","Noruega":"🇳🇴","Áustria":"🇦🇹","Jordânia":"🇯🇴",
  "Portugal":"🇵🇹","Congo (RD)":"🇨🇩","Inglaterra":"🏴󠁧󠁢󠁥󠁮󠁧󠁿","Croácia":"🇭🇷","Gana":"🇬🇭","Panamá":"🇵🇦",
  "Uzbequistão":"🇺🇿","Colômbia":"🇨🇴",
};
const flag = (t) => FLAGS[t] || "🏳️";
const grpLabel = (g) => (/^[A-L]$/.test(g.group) ? "Grupo " + g.group : g.group);
const ROUND_LABEL = { 1:"1ª Rodada", 2:"2ª Rodada", 3:"3ª Rodada", 4:"32-avos de Final", 5:"Oitavas de Final", 6:"Quartas de Final", 7:"Semifinais", 8:"Disputa de 3º Lugar", 9:"Final" };

// PT -> EN (para casar com o feed openfootball; vagas de repescagem ficam de fora propositalmente)
const PT2EN = {
  "México":"Mexico","África do Sul":"South Africa","Coreia do Sul":"South Korea","Canadá":"Canada",
  "Catar":"Qatar","Suíça":"Switzerland","Estados Unidos":"USA","Paraguai":"Paraguay","Austrália":"Australia",
  "Brasil":"Brazil","Marrocos":"Morocco","Haiti":"Haiti","Escócia":"Scotland","Alemanha":"Germany",
  "Curaçao":"Curaçao","Holanda":"Netherlands","Japão":"Japan","Costa do Marfim":"Ivory Coast","Equador":"Ecuador",
  "Tunísia":"Tunisia","Espanha":"Spain","Cabo Verde":"Cape Verde","Bélgica":"Belgium","Egito":"Egypt",
  "Arábia Saudita":"Saudi Arabia","Uruguai":"Uruguay","Irã":"Iran","Nova Zelândia":"New Zealand",
  "Argentina":"Argentina","Argélia":"Algeria","França":"France","Senegal":"Senegal","Noruega":"Norway",
  "Áustria":"Austria","Jordânia":"Jordan","Portugal":"Portugal","Inglaterra":"England","Croácia":"Croatia",
  "Gana":"Ghana","Panamá":"Panama","Uzbequistão":"Uzbekistan","Colômbia":"Colombia",
};
const OPENFOOTBALL_URL = "https://raw.githubusercontent.com/openfootball/worldcup.json/master/2026/worldcup.json";

// ---------- Pontuação / utils ----------
function scoreOf(guess, result, cfg) {
  if (!guess || !result) return null;
  if ([guess.h, guess.a, result.h, result.a].some((v) => v === "" || v === null || v === undefined || isNaN(Number(v)))) return null;
  const Gh = Number(guess.h), Ga = Number(guess.a), Rh = Number(result.h), Ra = Number(result.a);
  if (Gh === Rh && Ga === Ra) return cfg.pExact;
  const go = Math.sign(Gh - Ga), ro = Math.sign(Rh - Ra);
  if (go === ro) return (Gh - Ga) === (Rh - Ra) ? cfg.pDiff : cfg.pWin;
  return 0;
}
const hasResult = (r) => r && r.h !== "" && r.a !== "" && r.h != null && r.a != null && !isNaN(Number(r.h)) && !isNaN(Number(r.a));
const isExact = (b, r) => b && hasResult(r) && b.h !== "" && b.a !== "" && b.h != null && b.a != null && Number(b.h) === Number(r.h) && Number(b.a) === Number(r.a);
function fmtDate(iso) {
  try {
    const d = new Date(iso);
    const wd = d.toLocaleDateString("pt-BR", { weekday: "short", timeZone: "America/Sao_Paulo" }).replace(".", "");
    const dm = d.toLocaleDateString("pt-BR", { day: "2-digit", month: "2-digit", timeZone: "America/Sao_Paulo" });
    const hm = d.toLocaleTimeString("pt-BR", { hour: "2-digit", minute: "2-digit", timeZone: "America/Sao_Paulo" });
    return wd + " " + dm + " · " + hm;
  } catch (e) { return iso; }
}
const uid = () => "x" + Date.now().toString(36) + Math.random().toString(36).slice(2, 6);
const money = (n, unit) => (unit === "R$" ? "R$ " : "") + Number(n || 0).toLocaleString("pt-BR") + (unit !== "R$" ? " " + unit : "");
const numOrNull = (v) => (v === "" || v === null || v === undefined || isNaN(Number(v)) ? null : Number(v));

// ---------- Supabase ----------
const sb = (window.BOLAO && window.BOLAO.SUPABASE_URL && !/COLE_AQUI/.test(window.BOLAO.SUPABASE_URL))
  ? window.supabase.createClient(window.BOLAO.SUPABASE_URL, window.BOLAO.SUPABASE_ANON_KEY)
  : null;

// ---------- Classificação dos grupos ----------
function computeStandings(games, results) {
  const groups = {};
  games.forEach((g) => {
    if (!/^[A-L]$/.test(g.group)) return;
    const grp = (groups[g.group] = groups[g.group] || {});
    [g.home, g.away].forEach((t) => { if (!grp[t]) grp[t] = { name: t, J: 0, V: 0, E: 0, D: 0, GP: 0, GC: 0, Pts: 0 }; });
    const r = results[g.id];
    if (!hasResult(r)) return;
    const rh = Number(r.h), ra = Number(r.a), H = grp[g.home], A = grp[g.away];
    H.J++; A.J++; H.GP += rh; H.GC += ra; A.GP += ra; A.GC += rh;
    if (rh > ra) { H.V++; A.D++; H.Pts += 3; } else if (rh < ra) { A.V++; H.D++; A.Pts += 3; } else { H.E++; A.E++; H.Pts++; A.Pts++; }
  });
  const sortTeams = (arr) => arr.slice().sort((a, b) => b.Pts - a.Pts || (b.GP - b.GC) - (a.GP - a.GC) || b.GP - a.GP || a.name.localeCompare(b.name));
  const table = {};
  Object.keys(groups).sort().forEach((k) => { table[k] = sortTeams(Object.values(groups[k])); });
  const thirds = Object.keys(table).map((k) => { const t = table[k][2]; return t ? Object.assign({}, t, { group: k, SG: t.GP - t.GC }) : null; }).filter(Boolean);
  const thirdsRanked = thirds.sort((a, b) => b.Pts - a.Pts || b.SG - a.SG || b.GP - a.GP || a.name.localeCompare(b.name));
  return { table, thirdsRanked };
}

// ---------- Cravada acumulada ----------
function computeCravadas(cravadas, games, results, cbById, players) {
  const gmap = {}; games.forEach((g) => gmap[g.id] = g);
  const ordered = cravadas.slice().sort((a, b) => new Date((gmap[a.gameId] || {}).dt || 0) - new Date((gmap[b.gameId] || {}).dt || 0));
  let carry = 0; const rounds = []; let currentPot = 0, currentRoundId = null;
  for (const cr of ordered) {
    const game = gmap[cr.gameId]; if (!game) continue;
    const pot = Number(cr.base || 0) + carry; const res = results[cr.gameId];
    if (hasResult(res)) {
      const winners = players.filter((p) => isExact((cbById[p.id] || {})[cr.id], res));
      if (winners.length > 0) { const each = Math.round((pot / winners.length) * 100) / 100; rounds.push(Object.assign({}, cr, { game, pot, status: "ganha", winners, each })); carry = 0; }
      else { rounds.push(Object.assign({}, cr, { game, pot, status: "acumulou", winners: [], each: 0 })); carry = pot; }
    } else { rounds.push(Object.assign({}, cr, { game, pot, status: "aberta", winners: [], each: 0 })); if (currentRoundId == null) { currentPot = pot; currentRoundId = cr.id; } }
  }
  return { rounds, currentPot, currentRoundId, pendingCarry: currentRoundId == null ? carry : 0 };
}

// ============================================================
// App
// ============================================================
function App() {
  const [loading, setLoading] = useState(true);
  const [err, setErr] = useState(sb ? "" : "config");
  const [screen, setScreen] = useState("aovivo");
  const [cfg, setCfg] = useState(DEFAULT_CFG);
  const [games, setGames] = useState([]);
  const [results, setResults] = useState({});
  const [players, setPlayers] = useState([]);
  const [guessesById, setGuessesById] = useState({});
  const [cravadas, setCravadas] = useState([]);
  const [cbById, setCbById] = useState({});
  const [me, setMe] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [saving, setSaving] = useState(false);

  const pendingGuesses = useRef({});
  const pendingCb = useRef({});
  const pendingResults = useRef({});
  const meRef = useRef(null); meRef.current = me;
  const reloadTimer = useRef(null);

  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 10000); return () => clearInterval(t); }, []);

  const loadAll = useCallback(async () => {
    if (!sb) { setLoading(false); return; }
    try {
      const [gR, pR, rR, guR, cvR, cbR, cfR] = await Promise.all([
        sb.from("games").select("*"),
        sb.from("players").select("*"),
        sb.from("results").select("*"),
        sb.from("guesses").select("*"),
        sb.from("cravadas").select("*"),
        sb.from("cravada_bets").select("*"),
        sb.from("config").select("*").eq("k", "cfg").maybeSingle(),
      ]);
      const anyErr = gR.error || pR.error || rR.error;
      if (anyErr) { setErr("db:" + anyErr.message); setLoading(false); return; }
      const gv = (gR.data || []).map((g) => ({ id: g.id, group: g.grp, round: g.round, dt: g.dt, home: g.home, away: g.away, venue: g.venue }))
        .sort((a, b) => a.round - b.round || new Date(a.dt) - new Date(b.dt));
      const pv = (pR.data || []).slice().sort((a, b) => (a.created_at || "").localeCompare(b.created_at || "") || a.name.localeCompare(b.name));
      const rv = {}; (rR.data || []).forEach((r) => { rv[r.game_id] = { h: r.h == null ? "" : r.h, a: r.a == null ? "" : r.a }; });
      const gb = {}; pv.forEach((p) => gb[p.id] = {});
      (guR.data || []).forEach((g) => { (gb[g.player_id] = gb[g.player_id] || {})[g.game_id] = { h: g.h == null ? "" : g.h, a: g.a == null ? "" : g.a }; });
      const cb = {}; pv.forEach((p) => cb[p.id] = {});
      (cbR.data || []).forEach((b) => { (cb[b.player_id] = cb[b.player_id] || {})[b.cravada_id] = { h: b.h == null ? "" : b.h, a: b.a == null ? "" : b.a }; });
      const cvv = (cvR.data || []).map((c) => ({ id: c.id, gameId: c.game_id, base: Number(c.base || 0) }));
      // overlay de edições locais ainda não confirmadas
      const meId = meRef.current;
      if (meId) {
        gb[meId] = Object.assign({}, gb[meId] || {}, pendingGuesses.current);
        cb[meId] = Object.assign({}, cb[meId] || {}, pendingCb.current);
      }
      const rvMerged = Object.assign({}, rv, pendingResults.current);
      setGames(gv); setPlayers(pv); setResults(rvMerged); setGuessesById(gb); setCbById(cb); setCravadas(cvv);
      if (cfR.data && cfR.data.v) setCfg(Object.assign({}, DEFAULT_CFG, cfR.data.v));
      setErr(""); setLoading(false);
    } catch (e) { setErr("ex:" + (e && e.message ? e.message : "falha")); setLoading(false); }
  }, []);

  useEffect(() => { loadAll(); }, [loadAll]);

  // Realtime + polling de segurança
  const scheduleReload = useCallback(() => { if (reloadTimer.current) clearTimeout(reloadTimer.current); reloadTimer.current = setTimeout(() => loadAll(), 500); }, [loadAll]);
  useEffect(() => {
    if (!sb) return;
    const ch = sb.channel("bolao-all").on("postgres_changes", { event: "*", schema: "public" }, () => scheduleReload()).subscribe();
    const poll = setInterval(() => loadAll(), 15000);
    return () => { try { sb.removeChannel(ch); } catch (e) {} clearInterval(poll); };
  }, [scheduleReload, loadAll]);

  const meConfirmed = !!((players.find((p) => p.id === me) || {}).grupos_confirmado);
  const isLocked = useCallback((game) => {
    if (game.round <= 3) { // fase de grupos: trava no apito do jogo OU trava global (organizadores) OU confirmação individual
      return now >= new Date(game.dt).getTime() || !!cfg.gruposTravado || meConfirmed;
    }
    // mata-mata: fica TRAVADO até abrir (fim da fase de grupos, com confrontos reais);
    // depois de aberto, fecha no prazo do mata-mata (deadlineMata) ou no apito de cada jogo.
    if (!cfg.mataAbre || now < new Date(cfg.mataAbre).getTime()) return true; // ainda não abriu
    const dlm = cfg.deadlineMata ? new Date(cfg.deadlineMata).getTime() : null;
    return now >= (dlm != null ? dlm : new Date(game.dt).getTime());
  }, [now, cfg.gruposTravado, cfg.mataAbre, cfg.deadlineMata, meConfirmed]);
  const confirmGrupos = async () => { if (!me || !sb) return; await sb.from("players").update({ grupos_confirmado: true }).eq("id", me); await loadAll(); };
  const myGuesses = me ? (guessesById[me] || {}) : {};
  const myCb = me ? (cbById[me] || {}) : {};

  // ---- Gravações (Supabase) ----
  const flushGuesses = useRef(null);
  const setGuess = (gameId, field, value) => {
    if (!me) return;
    const g = Object.assign({}, myGuesses[gameId] || { h: "", a: "" }); g[field] = value;
    setGuessesById((prev) => Object.assign({}, prev, { [me]: Object.assign({}, prev[me] || {}, { [gameId]: g }) }));
    pendingGuesses.current[gameId] = g;
    if (flushGuesses.current) clearTimeout(flushGuesses.current);
    setSaving(true);
    flushGuesses.current = setTimeout(async () => {
      const patch = Object.assign({}, pendingGuesses.current);
      const rows = Object.keys(patch).map((gid) => ({ player_id: me, game_id: gid, h: numOrNull(patch[gid].h), a: numOrNull(patch[gid].a) }));
      if (rows.length && sb) await sb.from("guesses").upsert(rows, { onConflict: "player_id,game_id" });
      Object.keys(patch).forEach((k) => { if (pendingGuesses.current[k] === patch[k]) delete pendingGuesses.current[k]; });
      setSaving(false);
    }, 700);
  };

  const flushCb = useRef(null);
  const setCb = (cravadaId, field, value) => {
    if (!me) return;
    const b = Object.assign({}, myCb[cravadaId] || { h: "", a: "" }); b[field] = value;
    setCbById((prev) => Object.assign({}, prev, { [me]: Object.assign({}, prev[me] || {}, { [cravadaId]: b }) }));
    pendingCb.current[cravadaId] = b;
    if (flushCb.current) clearTimeout(flushCb.current);
    setSaving(true);
    flushCb.current = setTimeout(async () => {
      const patch = Object.assign({}, pendingCb.current);
      const rows = Object.keys(patch).map((cid) => ({ cravada_id: cid, player_id: me, h: numOrNull(patch[cid].h), a: numOrNull(patch[cid].a) }));
      if (rows.length && sb) await sb.from("cravada_bets").upsert(rows, { onConflict: "cravada_id,player_id" });
      Object.keys(patch).forEach((k) => { if (pendingCb.current[k] === patch[k]) delete pendingCb.current[k]; });
      setSaving(false);
    }, 700);
  };

  const flushRes = useRef(null);
  const setResult = (gameId, field, value) => {
    const cur = Object.assign({}, results[gameId] || { h: "", a: "" }, { [field]: value });
    setResults((prev) => Object.assign({}, prev, { [gameId]: cur }));
    pendingResults.current[gameId] = cur;
    if (flushRes.current) clearTimeout(flushRes.current);
    setSaving(true);
    flushRes.current = setTimeout(async () => {
      const patch = Object.assign({}, pendingResults.current);
      const rows = Object.keys(patch).map((gid) => ({ game_id: gid, h: numOrNull(patch[gid].h), a: numOrNull(patch[gid].a), updated_by: (players.find((p) => p.id === me) || {}).name || null, updated_at: new Date().toISOString() }));
      if (rows.length && sb) await sb.from("results").upsert(rows, { onConflict: "game_id" });
      Object.keys(patch).forEach((k) => { if (pendingResults.current[k] === patch[k]) delete pendingResults.current[k]; });
      setSaving(false);
    }, 700);
  };

  const addPlayer = async (name) => {
    const clean = (name || "").trim(); if (!clean || !sb) return;
    const exists = players.find((p) => p.name.toLowerCase() === clean.toLowerCase());
    if (exists) { setMe(exists.id); setScreen("aovivo"); return; }
    const np = { id: uid(), name: clean };
    await sb.from("players").insert(np);
    await loadAll(); setMe(np.id); setScreen("aovivo");
  };
  const saveCfg = async (next) => { setCfg(next); if (sb) await sb.from("config").upsert({ k: "cfg", v: next }, { onConflict: "k" }); };
  const addCravada = async (gameId, base) => { if (sb) { await sb.from("cravadas").insert({ id: uid(), game_id: gameId, base: Number(base) || 0 }); await loadAll(); } };
  const removeCravada = async (id) => { if (sb) { await sb.from("cravadas").delete().eq("id", id); await loadAll(); } };
  const renameGame = async (id, home, away) => { if (sb) { await sb.from("games").update({ home: home, away: away }).eq("id", id); await loadAll(); } };

  // Importar placares do openfootball (best-effort, fase de grupos)
  const importResults = async () => {
    if (!sb) return { ok: 0, msg: "Supabase não configurado." };
    let feed;
    try { const r = await fetch(OPENFOOTBALL_URL, { cache: "no-store" }); feed = await r.json(); }
    catch (e) { return { ok: 0, msg: "Não consegui acessar o feed (sem internet ou bloqueado)." }; }
    const matches = (feed && feed.matches) || [];
    const scoreOfMatch = (m) => {
      if (m.score && m.score.ft && m.score.ft.length === 2) return { h: m.score.ft[0], a: m.score.ft[1] };
      if (m.score1 != null && m.score2 != null) return { h: m.score1, a: m.score2 };
      return null;
    };
    const groupGames = games.filter((g) => /^[A-L]$/.test(g.group));
    const rows = [];
    groupGames.forEach((g) => {
      const enH = PT2EN[g.home], enA = PT2EN[g.away];
      if (!enH || !enA) return; // vaga de repescagem ainda não resolvida no feed
      const fm = matches.find((m) => m.group === "Group " + g.group && ((m.team1 === enH && m.team2 === enA) || (m.team1 === enA && m.team2 === enH)));
      if (!fm) return;
      const sc = scoreOfMatch(fm); if (!sc) return;
      const swap = fm.team1 === enA; // feed em ordem invertida
      rows.push({ game_id: g.id, h: swap ? sc.a : sc.h, a: swap ? sc.h : sc.a, updated_by: "openfootball", updated_at: new Date().toISOString() });
    });
    if (!rows.length) return { ok: 0, msg: "Nenhum placar novo disponível no feed ainda." };
    await sb.from("results").upsert(rows, { onConflict: "game_id" });
    await loadAll();
    return { ok: rows.length, msg: "Importei " + rows.length + " placar(es) da fase de grupos. Confira e ajuste se precisar." };
  };

  const cravadaComputed = useMemo(() => computeCravadas(cravadas, games, results, cbById, players), [cravadas, games, results, cbById, players]);

  const ranking = useMemo(() => {
    const winMap = {};
    cravadaComputed.rounds.forEach((rd) => { if (rd.status === "ganha") rd.winners.forEach((w) => { winMap[w.id] = winMap[w.id] || { wins: 0, total: 0 }; winMap[w.id].wins++; winMap[w.id].total += rd.each; }); });
    return players.map((p) => {
      const gs = guessesById[p.id] || {}; let total = 0, exatos = 0, palpites = 0;
      games.forEach((game) => {
        const guess = gs[game.id];
        if (guess && (guess.h !== "" || guess.a !== "")) palpites++;
        const res = results[game.id]; if (!hasResult(res)) return;
        const sc = scoreOf(guess, res, cfg); if (sc == null) return; total += sc; if (isExact(guess, res)) exatos++;
      });
      const cw = winMap[p.id] || { wins: 0, total: 0 };
      return Object.assign({}, p, { total, exatos, palpites, cravadaWins: cw.wins, cravadaTotal: cw.total });
    }).sort((a, b) => b.total - a.total || b.exatos - a.exatos || a.name.localeCompare(b.name));
  }, [players, guessesById, games, results, cfg, cravadaComputed]);

  const resolvedCount = useMemo(() => games.filter((g) => hasResult(results[g.id])).length, [games, results]);

  if (!sb || err === "config") return <ConfigMissing />;
  if (loading) return (<div style={{ background: C.bg, color: C.txt, minHeight: "100vh" }} className="flex items-center justify-center"><div className="text-center"><div className="text-4xl mb-3">🏆</div><p style={{ color: C.mut }}>Carregando o bolão…</p></div></div>);
  if (err) return (<div style={{ background: C.bg, color: C.txt, minHeight: "100vh" }} className="flex items-center justify-center p-6"><div className="text-center max-w-sm"><div className="text-3xl mb-2">⚠️</div><p className="font-bold mb-1">Não consegui falar com o banco</p><p className="text-xs mb-3" style={{ color: C.mut }}>{err}</p><p className="text-xs" style={{ color: C.mut }}>Confira se você rodou o SQL no Supabase e se a URL/chave em config.js estão corretas.</p><button onClick={loadAll} style={{ background: C.green, color: "#06281c" }} className="mt-4 px-4 py-2 rounded-lg font-semibold">Tentar de novo</button></div></div>);

  if (!me) return <Entrada players={players} addPlayer={addPlayer} onPick={(id) => { setMe(id); setScreen("aovivo"); }} />;
  const meName = (players.find((p) => p.id === me) || {}).name || "";

  return (
    <div style={{ background: C.bg, color: C.txt, minHeight: "100vh", fontFamily: "system-ui, sans-serif" }}>
      <div style={{ background: "linear-gradient(135deg, " + C.card2 + ", " + C.card + ")", borderBottom: "1px solid " + C.line }} className="px-4 pt-4 pb-3 sticky top-0 z-20">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2">
            <span className="text-xl">🏆</span>
            <div><h1 className="font-bold leading-tight">Bolão da Copa 2026</h1><p className="text-xs" style={{ color: C.mut }}>FG · {resolvedCount}/{games.length} jogos com resultado</p></div>
          </div>
          <div className="flex items-center gap-2">
            {saving && <span className="text-xs" style={{ color: C.green }}>salvando…</span>}
            <button onClick={loadAll} title="Atualizar" style={{ background: C.card }} className="p-2 rounded-lg active:opacity-70">↻</button>
          </div>
        </div>
        <div className="mt-2 flex items-center gap-2 text-xs">
          <span style={{ color: C.mut }}>jogando como</span>
          <button onClick={() => setMe(null)} style={{ background: C.green, color: "#06281c" }} className="px-2 py-1 rounded-full font-semibold">{meName} ▾</button>
        </div>
      </div>

      <div className="p-3 pb-24 max-w-2xl mx-auto">
        {screen === "aovivo" && <AoVivo games={games} results={results} guessesById={guessesById} players={players} cravadas={cravadas} cfg={cfg} isLocked={isLocked} now={now} />}
        {screen === "jogos" && <Jogos games={games} myGuesses={myGuesses} setGuess={setGuess} isLocked={isLocked} results={results} cfg={cfg} now={now} meConfirmed={meConfirmed} confirmGrupos={confirmGrupos} />}
        {screen === "resultados" && <Resultados games={games} results={results} setResult={setResult} importResults={importResults} isAdmin={ADMINS.includes(me)} players={players} guessesById={guessesById} cfg={cfg} now={now} />}
        {screen === "grupos" && <Standings games={games} results={results} />}
        {screen === "cravada" && <Cravada cfg={cfg} games={games} cravadas={cravadas} addCravada={addCravada} removeCravada={removeCravada} computed={cravadaComputed} myCb={myCb} setCb={setCb} cbById={cbById} players={players} me={me} now={now} results={results} />}
        {screen === "ranking" && <Ranking ranking={ranking} cfg={cfg} />}
        {screen === "config" && <Config cfg={cfg} saveCfg={saveCfg} games={games} renameGame={renameGame} me={me} />}
      </div>

      <div style={{ background: C.card, borderTop: "1px solid " + C.line }} className="fixed bottom-0 left-0 right-0 z-20">
        <div className="max-w-2xl mx-auto grid grid-cols-7">
          {[
            { k: "aovivo", ic: "📡", lb: "Ao Vivo" },
            { k: "jogos", ic: "🎯", lb: "Palpites" },
            { k: "resultados", ic: "📋", lb: "Result." },
            { k: "grupos", ic: "📊", lb: "Grupos" },
            { k: "cravada", ic: "🪙", lb: "Cravada" },
            { k: "ranking", ic: "🏆", lb: "Ranking" },
            { k: "config", ic: "⚙️", lb: "Regras" },
          ].map((it) => (
            <button key={it.k} onClick={() => setScreen(it.k)} className="py-2 flex flex-col items-center gap-0.5" style={{ color: screen === it.k ? C.gold : C.mut }}>
              <span style={{ fontSize: 17, filter: screen === it.k ? "none" : "grayscale(0.4)" }}>{it.ic}</span>
              <span style={{ fontSize: 10 }}>{it.lb}</span>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}

// ---------- Tela de configuração ausente ----------
function ConfigMissing() {
  return (
    <div style={{ background: C.bg, color: C.txt, minHeight: "100vh" }} className="flex items-center justify-center p-6">
      <div className="max-w-sm text-center">
        <div className="text-4xl mb-3">⚙️</div>
        <h1 className="font-bold text-lg mb-2">Falta configurar o Supabase</h1>
        <p className="text-sm mb-3" style={{ color: C.mut }}>Abra o arquivo <b style={{ color: C.txt }}>config.js</b> e cole a URL do projeto e a chave anon do seu Supabase. Depois recarregue.</p>
        <p className="text-xs" style={{ color: C.mut }}>O passo a passo completo está no arquivo GUIA-DEPLOY.md.</p>
      </div>
    </div>
  );
}

// ---------- Entrada ----------
function Entrada({ players, addPlayer, onPick }) {
  const [name, setName] = useState("");
  return (
    <div style={{ background: C.bg, color: C.txt, minHeight: "100vh" }} className="flex items-center justify-center p-5">
      <div className="w-full max-w-sm">
        <div className="text-center mb-6"><div className="text-5xl mb-2">🏆</div><h1 className="text-2xl font-bold">Bolão da Copa 2026</h1><p style={{ color: C.mut }} className="text-sm mt-1">Equipe FG · Quem é você?</p></div>
        {players.length > 0 && (
          <div className="mb-4">
            <p className="text-xs mb-2" style={{ color: C.mut }}>Toque no seu nome:</p>
            <div className="flex flex-wrap gap-2">{players.map((p) => (<button key={p.id} onClick={() => onPick(p.id)} style={{ background: C.card2, border: "1px solid " + C.line }} className="px-3 py-2 rounded-lg text-sm active:opacity-70">{p.name}</button>))}</div>
          </div>
        )}
        <p className="text-xs mb-2" style={{ color: C.mut }}>Ou entre com um novo nome:</p>
        <div className="flex gap-2">
          <input value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlayer(name)} placeholder="Seu nome" style={{ background: C.card, border: "1px solid " + C.line, color: C.txt }} className="flex-1 px-3 py-2.5 rounded-lg outline-none" />
          <button onClick={() => addPlayer(name)} style={{ background: C.green, color: "#06281c" }} className="px-4 rounded-lg font-semibold active:opacity-80">Entrar</button>
        </div>
        <p className="text-xs mt-5 text-center" style={{ color: C.mut }}>Palpites, Cravada e ranking são compartilhados — todos veem tudo em tempo real.</p>
      </div>
    </div>
  );
}

// ---------- ScoreInput ----------
function ScoreInput({ value, onChange, disabled }) {
  return (<input type="number" inputMode="numeric" min="0" value={value} disabled={disabled} onChange={(e) => onChange(e.target.value === "" ? "" : Math.max(0, parseInt(e.target.value) || 0))} style={{ background: disabled ? C.card2 : C.bg, border: "1px solid " + C.line, color: C.txt, width: 42, opacity: disabled ? 0.6 : 1 }} className="text-center py-1.5 rounded-lg outline-none font-bold" />);
}

// ---------- Palpites ----------
function Jogos({ games, myGuesses, setGuess, isLocked, results, cfg, now, meConfirmed, confirmGrupos }) {
  const [filter, setFilter] = useState("todos");
  const [collapsed, setCollapsed] = useState({});
  const gTravado = !!cfg.gruposTravado;
  const faltamGrupo = games.filter((g) => g.round <= 3 && !(myGuesses[g.id] && myGuesses[g.id].h !== "" && myGuesses[g.id].a !== "")).length;
  const doConfirm = () => { if (typeof window !== "undefined" && window.confirm && !window.confirm(faltamGrupo > 0 ? "Você ainda tem " + faltamGrupo + " jogo(s) de grupo sem palpite. Confirmar e travar mesmo assim? Não dá para alterar depois." : "Confirmar e travar seus palpites da fase de grupos? Não dá para alterar depois.")) return; confirmGrupos(); };
  const filtered = useMemo(() => {
    let gs = games;
    if (filter === "brasil") gs = gs.filter((g) => g.home === "Brasil" || g.away === "Brasil");
    if (filter === "abertos") gs = gs.filter((g) => !isLocked(g));
    if (filter === "mata") gs = gs.filter((g) => g.round > 3);
    return gs;
  }, [games, filter, isLocked]);
  const grouped = useMemo(() => { const m = {}; filtered.forEach((g) => { (m[g.round || 0] = m[g.round || 0] || []).push(g); }); return Object.entries(m).sort((a, b) => a[0] - b[0]); }, [filtered]);
  const Pill = ({ k, lb }) => (<button onClick={() => setFilter(k)} style={{ background: filter === k ? C.gold : C.card, color: filter === k ? "#2b2100" : C.mut, border: "1px solid " + C.line }} className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap active:opacity-70">{lb}</button>);
  return (
    <div>
      <div className="flex gap-2 overflow-x-auto pb-2 mb-1"><Pill k="todos" lb="Todos" /><Pill k="abertos" lb="Em aberto" /><Pill k="brasil" lb="🇧🇷 Brasil" /><Pill k="mata" lb="Mata-mata" /></div>
      <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-2.5 mb-3 text-xs flex flex-wrap gap-x-3 gap-y-1">
        <span style={{ color: C.mut }}>Pontos:</span><span><b style={{ color: C.green }}>{cfg.pExact}</b> placar exato</span><span><b style={{ color: C.green }}>{cfg.pDiff}</b> vencedor + saldo</span><span><b style={{ color: C.green }}>{cfg.pWin}</b> só vencedor</span>
      </div>
      <div style={{ background: gTravado ? "rgba(255,84,112,0.12)" : C.card2, border: "1px solid " + (gTravado ? C.danger : C.line) }} className="rounded-lg p-2.5 mb-3 text-xs"><p style={{ color: C.txt }}>{gTravado ? "🔒 Os palpites da fase de grupos foram travados pelos organizadores — ninguém altera mais." : "Palpites abertos. Cada jogo trava sozinho no apito; os organizadores travam tudo quando todos terminarem. O mata-mata entra quando os confrontos saírem."}</p></div>
      {!gTravado && (meConfirmed
        ? <div style={{ background: "rgba(0,217,126,0.12)", border: "1px solid " + C.green }} className="rounded-lg p-2.5 mb-3 text-xs"><p style={{ color: C.txt }}>🔒 Seus palpites da fase de grupos estão <b>confirmados e travados</b>. Não é possível alterar.</p></div>
        : <div style={{ background: C.card2, border: "1px solid " + C.gold }} className="rounded-lg p-2.5 mb-3"><p className="text-xs mb-2" style={{ color: C.mut }}>Terminou de palpitar? Confirme para travar de vez (não dá para mudar depois). {faltamGrupo > 0 ? "Faltam " + faltamGrupo + " jogo(s) de grupo sem palpite." : "Todos os jogos de grupo preenchidos."}</p><button onClick={doConfirm} style={{ background: C.green, color: "#06281c" }} className="w-full py-2 rounded-lg font-semibold active:opacity-80">✅ Confirmar e travar meus palpites</button></div>)}
      {grouped.map((entry) => {
        const round = entry[0], list = entry[1], isC = collapsed[round];
        return (
          <div key={round} className="mb-4">
            <button onClick={() => setCollapsed((c) => Object.assign({}, c, { [round]: !c[round] }))} className="w-full flex items-center justify-between mb-2">
              <h2 className="font-bold text-sm" style={{ color: C.gold }}>{ROUND_LABEL[round] || "Mata-mata"}</h2><span style={{ color: C.mut }}>{isC ? "▾" : "▴"}</span>
            </button>
            {!isC && list.map((g) => <GameRow key={g.id} g={g} guess={myGuesses[g.id]} setGuess={setGuess} locked={isLocked(g)} result={results[g.id]} cfg={cfg} />)}
          </div>
        );
      })}
    </div>
  );
}
function GameRow({ g, guess, setGuess, locked, result, cfg }) {
  const gv = guess || { h: "", a: "" }; const resolved = hasResult(result); const sc = resolved ? scoreOf(gv, result, cfg) : null;
  return (
    <div style={{ background: C.card, border: "1px solid " + C.line, borderRadius: 12 }} className="p-3 mb-2">
      <div className="flex items-center justify-between mb-2"><span className="text-xs" style={{ color: C.mut }}>{grpLabel(g)} · {fmtDate(g.dt)}</span>{locked && <span className="text-xs" style={{ color: C.danger }}>🔒 fechado</span>}</div>
      <div className="grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
        <div className="flex items-center gap-1.5 min-w-0"><span className="text-xl">{flag(g.home)}</span><span className="text-sm truncate">{g.home}</span></div>
        <div className="flex items-center gap-1.5 px-2"><ScoreInput value={gv.h} onChange={(v) => setGuess(g.id, "h", v)} disabled={locked} /><span style={{ color: C.mut }}>×</span><ScoreInput value={gv.a} onChange={(v) => setGuess(g.id, "a", v)} disabled={locked} /></div>
        <div className="flex items-center gap-1.5 min-w-0 justify-end"><span className="text-sm truncate text-right">{g.away}</span><span className="text-xl">{flag(g.away)}</span></div>
      </div>
      {resolved && (<div className="mt-2 pt-2 flex items-center justify-between text-xs" style={{ borderTop: "1px solid " + C.line }}><span style={{ color: C.mut }}>Oficial: <b style={{ color: C.txt }}>{result.h} × {result.a}</b></span><span className="font-bold px-2 py-0.5 rounded-full" style={{ background: sc > 0 ? C.green : C.card2, color: sc > 0 ? "#06281c" : C.mut }}>{sc > 0 ? "+" + sc + " pts" : "0 pts"}</span></div>)}
    </div>
  );
}

// ---------- Resultados ----------
function Resultados({ games, results, setResult, importResults, isAdmin, players, guessesById, cfg, now }) {
  const [filter, setFilter] = useState("todos");
  const [msg, setMsg] = useState(""); const [busy, setBusy] = useState(false);
  const [openG, setOpenG] = useState({});
  const list = useMemo(() => {
    let gs = games.slice();
    if (filter === "pendentes") gs = gs.filter((g) => !hasResult(results[g.id]));
    if (filter === "lancados") gs = gs.filter((g) => hasResult(results[g.id]));
    return gs;
  }, [games, results, filter]);
  const doImport = async () => { setBusy(true); setMsg(""); const r = await importResults(); setMsg(r.msg); setBusy(false); };
  const Pill = ({ k, lb }) => (<button onClick={() => setFilter(k)} style={{ background: filter === k ? C.blue : C.card, color: filter === k ? "#fff" : C.mut, border: "1px solid " + C.line }} className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap active:opacity-70">{lb}</button>);
  return (
    <div>
      <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-3 mb-3 text-xs"><p style={{ color: C.mut }}>{isAdmin ? "Você pode lançar os placares oficiais. Ao salvar, propaga para todos em tempo real e recalcula ranking, grupos e Cravada." : "🔒 Somente Dr. Thiago e Eduardo lançam os placares oficiais. Aqui você acompanha os resultados."}</p></div>
      {isAdmin && <button onClick={doImport} disabled={busy} style={{ background: C.purple, color: "#fff", opacity: busy ? 0.6 : 1 }} className="w-full py-2.5 rounded-lg font-semibold mb-2 active:opacity-80">{busy ? "Buscando…" : "🌐 Importar placares da internet (fase de grupos)"}</button>}
      {isAdmin && msg && <p className="text-xs mb-2" style={{ color: C.green }}>{msg}</p>}
      {isAdmin && <p className="text-xs mb-3" style={{ color: C.mut }}>A importação é best-effort (fonte gratuita openfootball) e pode atrasar; o mata-mata e o que faltar você lança à mão.</p>}
      <div className="flex gap-2 overflow-x-auto pb-2 mb-2"><Pill k="todos" lb="Todos" /><Pill k="pendentes" lb="Sem placar" /><Pill k="lancados" lb="Já lançados" /></div>
      {list.map((g) => {
        const r = results[g.id] || { h: "", a: "" }; const done = hasResult(r);
        return (
          <div key={g.id} style={{ background: C.card, border: "1px solid " + (done ? C.green : C.line) }} className="p-3 mb-2 rounded-xl">
            <div className="flex items-center justify-between mb-2"><span className="text-xs" style={{ color: C.mut }}>{grpLabel(g)} · {fmtDate(g.dt)}</span>{done && <span style={{ color: C.green }}>✓</span>}</div>
            <div className="grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
              <div className="flex items-center gap-1.5 min-w-0"><span className="text-xl">{flag(g.home)}</span><span className="text-sm truncate">{g.home}</span></div>
              <div className="flex items-center gap-1.5 px-2"><ScoreInput value={r.h} onChange={(v) => setResult(g.id, "h", v)} disabled={!isAdmin} /><span style={{ color: C.mut }}>×</span><ScoreInput value={r.a} onChange={(v) => setResult(g.id, "a", v)} disabled={!isAdmin} /></div>
              <div className="flex items-center gap-1.5 min-w-0 justify-end"><span className="text-sm truncate text-right">{g.away}</span><span className="text-xl">{flag(g.away)}</span></div>
            </div>
            {now >= new Date(g.dt).getTime() && (
              <div className="mt-2 pt-2" style={{ borderTop: "1px solid " + C.line }}>
                <button onClick={() => setOpenG((o) => Object.assign({}, o, { [g.id]: !o[g.id] }))} className="text-xs font-medium" style={{ color: C.blue }}>👥 {openG[g.id] ? "ocultar" : "ver"} palpites de todos</button>
                {openG[g.id] && <div className="mt-2 flex flex-wrap gap-1.5">{players.map((p) => { const gg = (guessesById[p.id] || {})[g.id]; const filled = gg && gg.h !== "" && gg.a !== ""; const sc = hasResult(r) ? scoreOf(gg, r, cfg) : null; const ex = isExact(gg, r); return (<span key={p.id} style={{ background: sc > 0 ? C.green : C.card2, color: sc > 0 ? "#06281c" : C.txt, border: "1px solid " + C.line }} className="text-xs px-2 py-1 rounded-full">{p.name}: {filled ? gg.h + "×" + gg.a : "—"}{ex ? " 🎯" : (sc > 0 ? " ✓" : "")}</span>); })}</div>}
              </div>
            )}
          </div>
        );
      })}
    </div>
  );
}

// ---------- Cravada ----------
function Cravada({ cfg, games, cravadas, addCravada, removeCravada, computed, myCb, setCb, cbById, players, me, now, results }) {
  const isLocked = (g) => now >= new Date(g.dt).getTime(); // Cravada trava no apito do jogo dela
  const [adding, setAdding] = useState(false);
  const [selGame, setSelGame] = useState("");
  const [base, setBase] = useState(cfg.cravadaBase);
  useEffect(() => setBase(cfg.cravadaBase), [cfg.cravadaBase]);
  const usedGameIds = new Set(cravadas.map((c) => c.gameId));
  const upcoming = games.filter((g) => !usedGameIds.has(g.id) && !isLocked(g)).sort((a, b) => new Date(a.dt) - new Date(b.dt));
  const hasOpen = computed.currentRoundId != null;
  const headline = computed.currentRoundId != null ? computed.currentPot : computed.pendingCarry;
  const headlineLabel = computed.currentRoundId != null ? "Em disputa agora" : (computed.pendingCarry > 0 ? "Acumulado aguardando a próxima Cravada" : "Nenhuma Cravada ativa");
  const create = () => { if (!selGame) return; addCravada(selGame, Number(base) || 0); setSelGame(""); setBase(cfg.cravadaBase); setAdding(false); };
  const sorted = computed.rounds.slice().sort((a, b) => new Date(b.game.dt) - new Date(a.game.dt));
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, " + C.gold + ", #e0a800)", color: "#2b2100" }} className="rounded-2xl p-4 mb-4 text-center">
        <p className="text-xs font-semibold uppercase tracking-wide opacity-80">🪙 {headlineLabel}</p>
        <p className="text-3xl font-extrabold mt-1">{money(headline || 0, cfg.unit)}</p>
        <p className="text-xs mt-1 opacity-80">Acerte o placar exato e leve o prêmio. Ninguém acertou? Acumula pra próxima.</p>
      </div>
      <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-3 mb-3 text-xs"><p style={{ color: C.mut }}>A Cravada é um bolão à parte do ranking. Escolha um jogo, todos cravam <b style={{ color: C.txt }}>um placar exato</b>. Os palpites dos outros aparecem após o início do jogo.</p></div>
      {hasOpen ? (
        <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-3 mb-4 text-xs"><p style={{ color: C.mut }}>Há uma Cravada em aberto. A próxima só abre depois que esta for resolvida (resultado lançado).</p></div>
      ) : !adding ? (
        <button onClick={() => setAdding(true)} style={{ background: C.gold, color: "#2b2100" }} className="w-full py-2.5 rounded-lg font-semibold mb-4 active:opacity-80">+ Abrir nova Cravada</button>
      ) : (
        <div style={{ background: C.card, border: "1px solid " + C.gold }} className="rounded-xl p-3 mb-4 space-y-2">
          <p className="text-sm font-semibold">Nova Cravada</p>
          <select value={selGame} onChange={(e) => setSelGame(e.target.value)} style={{ background: C.bg, border: "1px solid " + C.line, color: C.txt }} className="w-full px-2 py-2 rounded-lg outline-none text-sm">
            <option value="">Escolha o jogo…</option>
            {upcoming.map((g) => <option key={g.id} value={g.id}>{g.home} × {g.away} — {fmtDate(g.dt)}</option>)}
          </select>
          <div className="flex items-center gap-2"><span className="text-sm" style={{ color: C.mut }}>Valor base ({cfg.unit}):</span><input type="number" min="0" value={base} onChange={(e) => setBase(Math.max(0, parseInt(e.target.value) || 0))} style={{ background: C.bg, border: "1px solid " + C.line, color: C.gold, width: 90 }} className="text-center py-1.5 rounded-lg outline-none font-bold" /></div>
          <div className="flex gap-2"><button onClick={create} style={{ background: C.gold, color: "#2b2100" }} className="flex-1 py-2 rounded-lg font-semibold">Abrir</button><button onClick={() => setAdding(false)} style={{ background: C.card2, color: C.mut }} className="px-4 rounded-lg">Cancelar</button></div>
        </div>
      )}
      {computed.rounds.length === 0 && <p style={{ color: C.mut }} className="text-sm text-center py-4">Nenhuma Cravada aberta ainda.</p>}
      {sorted.map((rd) => {
        const locked = isLocked(rd.game); const mine = myCb[rd.id] || { h: "", a: "" };
        return (
          <div key={rd.id} style={{ background: C.card, border: "1px solid " + (rd.status === "ganha" ? C.green : rd.status === "aberta" ? C.gold : C.line) }} className="rounded-xl p-3 mb-3">
            <div className="flex items-center justify-between mb-1"><span className="text-xs" style={{ color: C.mut }}>{grpLabel(rd.game)} · {fmtDate(rd.game.dt)}</span><div className="flex items-center gap-2"><span className="text-xs font-bold" style={{ color: C.gold }}>{money(rd.pot, cfg.unit)}</span>{rd.status === "aberta" && !locked && <button onClick={() => removeCravada(rd.id)} style={{ background: C.card2, color: C.danger }} className="px-1.5 rounded text-xs active:opacity-70">🗑</button>}</div></div>
            <div className="grid items-center mb-2" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
              <div className="flex items-center gap-1.5 min-w-0"><span className="text-xl">{flag(rd.game.home)}</span><span className="text-sm truncate">{rd.game.home}</span></div>
              <div className="flex items-center gap-1.5 px-2"><ScoreInput value={mine.h} onChange={(v) => setCb(rd.id, "h", v)} disabled={locked} /><span style={{ color: C.mut }}>×</span><ScoreInput value={mine.a} onChange={(v) => setCb(rd.id, "a", v)} disabled={locked} /></div>
              <div className="flex items-center gap-1.5 min-w-0 justify-end"><span className="text-sm truncate text-right">{rd.game.away}</span><span className="text-xl">{flag(rd.game.away)}</span></div>
            </div>
            {rd.status === "ganha" && (<div className="mt-1 pt-2 text-xs" style={{ borderTop: "1px solid " + C.line }}><p style={{ color: C.mut }}>Oficial: <b style={{ color: C.txt }}>{results[rd.gameId].h} × {results[rd.gameId].a}</b></p><p className="mt-1 font-semibold" style={{ color: C.green }}>👑 {rd.winners.map((w) => w.name).join(", ")} — {money(rd.each, cfg.unit)} {rd.winners.length > 1 ? "cada" : ""}</p></div>)}
            {rd.status === "acumulou" && (<div className="mt-1 pt-2 text-xs" style={{ borderTop: "1px solid " + C.line }}><p style={{ color: C.mut }}>Oficial: <b style={{ color: C.txt }}>{results[rd.gameId].h} × {results[rd.gameId].a}</b></p><p className="mt-1 font-semibold" style={{ color: C.gold }}>➡️ Ninguém cravou — {money(rd.pot, cfg.unit)} acumulou</p></div>)}
            <div className="mt-2 pt-2" style={{ borderTop: "1px solid " + C.line }}>
              <p className="text-xs mb-1" style={{ color: C.mut }}>Cravadas {locked ? "" : "(reveladas após o início)"}</p>
              <div className="flex flex-wrap gap-1.5">{players.map((p) => { const b = (cbById[p.id] || {})[rd.id]; const filled = b && b.h !== "" && b.a !== ""; const reveal = locked || p.id === me; const won = rd.status === "ganha" && rd.winners.some((w) => w.id === p.id); return (<span key={p.id} style={{ background: won ? C.green : C.card2, color: won ? "#06281c" : C.txt, border: "1px solid " + C.line }} className="text-xs px-2 py-1 rounded-full">{p.name}: {filled ? (reveal ? b.h + "×" + b.a : "••") : "—"}</span>); })}</div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

// ---------- Grupos + Mata-mata ----------
function Standings({ games, results }) {
  const sd = useMemo(() => computeStandings(games, results), [games, results]);
  const table = sd.table, thirdsRanked = sd.thirdsRanked;
  const groups = Object.keys(table);
  const qThirds = new Set(thirdsRanked.slice(0, 8).map((t) => t.group + "|" + t.name));
  const sg = (n) => (n > 0 ? "+" + n : "" + n);
  const ko = games.filter((g) => g.round > 3).sort((a, b) => a.round - b.round || new Date(a.dt) - new Date(b.dt));
  const koByRound = {}; ko.forEach((g) => { (koByRound[g.round] = koByRound[g.round] || []).push(g); });
  const Row = ({ t, pos, color }) => (
    <div className="grid items-center text-sm py-1" style={{ gridTemplateColumns: "20px 1fr 24px 34px 28px" }}>
      <span className="text-xs font-bold" style={{ color }}>{pos + 1}</span>
      <span className="flex items-center gap-1.5 min-w-0"><span>{flag(t.name)}</span><span className="truncate text-xs">{t.name}</span></span>
      <span className="text-center text-xs" style={{ color: C.mut }}>{t.J}</span>
      <span className="text-center text-xs" style={{ color: C.mut }}>{sg(t.GP - t.GC)}</span>
      <span className="text-center font-bold text-xs">{t.Pts}</span>
    </div>
  );
  return (
    <div>
      <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-3 mb-3 text-xs"><p style={{ color: C.mut }}>Monta-se sozinha conforme os <b style={{ color: C.txt }}>resultados</b> entram. <span style={{ color: C.green }}>Verde</span> = classificado (1º/2º). <span style={{ color: C.gold }}>Dourado</span> = 3º em disputa.</p></div>
      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2">
        {groups.map((k) => (
          <div key={k} style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3">
            <h3 className="font-bold text-sm mb-2" style={{ color: C.gold }}>Grupo {k}</h3>
            <div className="grid items-center text-xs font-semibold mb-1" style={{ gridTemplateColumns: "20px 1fr 24px 34px 28px", color: C.mut }}><span></span><span>Seleção</span><span className="text-center">J</span><span className="text-center">SG</span><span className="text-center">Pts</span></div>
            {table[k].map((t, i) => { const isQ = i < 2, isThird = i === 2; const thirdQ = isThird && qThirds.has(k + "|" + t.name); const color = isQ ? C.green : (isThird ? (thirdQ ? C.green : C.gold) : C.mut); return (<div key={t.name} style={{ background: isQ ? "rgba(0,217,126,0.08)" : (isThird ? "rgba(255,203,5,0.07)" : "transparent"), borderLeft: "2px solid " + (isQ ? C.green : (isThird ? C.gold : "transparent")) }} className="pl-1.5 rounded"><Row t={t} pos={i} color={color} /></div>); })}
          </div>
        ))}
      </div>
      <div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3 mt-3">
        <h3 className="font-bold text-sm mb-1" style={{ color: C.gold }}>Melhores 3ºs colocados</h3>
        <p className="text-xs mb-2" style={{ color: C.mut }}>Os 8 primeiros se classificam (em verde).</p>
        {thirdsRanked.map((t, i) => (<div key={t.group + t.name} className="grid items-center text-sm py-1" style={{ gridTemplateColumns: "20px 1fr 30px 28px", background: i < 8 ? "rgba(0,217,126,0.08)" : "transparent", borderLeft: "2px solid " + (i < 8 ? C.green : "transparent") }}><span className="text-xs font-bold pl-1" style={{ color: i < 8 ? C.green : C.mut }}>{i + 1}</span><span className="flex items-center gap-1.5 min-w-0"><span>{flag(t.name)}</span><span className="truncate text-xs">{t.name} <span style={{ color: C.mut }}>(G{t.group})</span></span></span><span className="text-center text-xs" style={{ color: C.mut }}>{sg(t.SG)}</span><span className="text-center font-bold text-xs">{t.Pts}</span></div>))}
      </div>
      <div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3 mt-3">
        <h3 className="font-bold text-sm mb-2" style={{ color: C.gold }}>Mata-mata</h3>
        <p className="text-xs mb-2" style={{ color: C.mut }}>Os confrontos se definem ao fim da fase de grupos. Renomeie as vagas em Regras → Jogos; os placares aparecem quando lançados.</p>
        {Object.keys(koByRound).sort((a, b) => a - b).map((rd) => (
          <div key={rd} className="mb-2.5"><p className="text-xs font-semibold mb-1" style={{ color: C.gold }}>{ROUND_LABEL[rd]}</p>
            {koByRound[rd].map((g) => { const r = results[g.id]; const sh = hasResult(r) ? r.h : "–", sa = hasResult(r) ? r.a : "–"; return (<div key={g.id} className="grid items-center text-xs py-0.5" style={{ gridTemplateColumns: "1fr 46px 1fr" }}><span className="flex items-center gap-1 min-w-0 justify-end"><span className="truncate text-right">{g.home}</span><span>{flag(g.home)}</span></span><span className="text-center" style={{ color: C.mut }}>{sh} × {sa}</span><span className="flex items-center gap-1 min-w-0"><span>{flag(g.away)}</span><span className="truncate">{g.away}</span></span></div>); })}
          </div>
        ))}
      </div>
      <p className="text-xs mt-3 px-1" style={{ color: C.mut }}>Critérios: pontos → saldo → gols pró. Em empates raros a FIFA usa desempates extras (confronto direto, etc.) e tabela fixa para os terceiros — use como guia.</p>
    </div>
  );
}

// ---------- Ranking ----------
function Ranking({ ranking, cfg }) {
  const medal = ["🥇", "🥈", "🥉"];
  return (
    <div>
      <h2 className="font-bold text-lg mb-3">🏆 Classificação</h2>
      {ranking.length === 0 && <p style={{ color: C.mut }} className="text-sm">Ninguém cadastrado ainda.</p>}
      {ranking.map((p, i) => (
        <div key={p.id} style={{ background: i === 0 ? "linear-gradient(135deg, " + C.card2 + ", " + C.card + ")" : C.card, border: "1px solid " + (i === 0 ? C.gold : C.line) }} className="p-3 mb-2 rounded-xl flex items-center justify-between">
          <div className="flex items-center gap-3 min-w-0"><span className="text-lg w-7 text-center font-bold" style={{ color: C.mut }}>{medal[i] || (i + 1)}</span><div className="min-w-0"><p className="font-semibold truncate">{p.name}</p><p className="text-xs" style={{ color: C.mut }}>{p.exatos} exatos · {p.palpites} palpites{p.cravadaWins > 0 ? " · 💰 " + money(p.cravadaTotal, cfg.unit) + " na Cravada" : ""}</p></div></div>
          <div className="text-right"><span className="text-xl font-bold" style={{ color: C.gold }}>{p.total}</span><span className="text-xs block" style={{ color: C.mut }}>pts</span></div>
        </div>
      ))}
    </div>
  );
}

// ---------- Ao Vivo ----------
function AoVivo({ games, results, guessesById, players, cravadas, cfg, isLocked, now }) {
  const sortedAsc = useMemo(() => games.slice().sort((a, b) => new Date(a.dt) - new Date(b.dt)), [games]);
  const focus = useMemo(() => {
    // Foca no jogo que JÁ COMEÇOU e ainda sem resultado (o mais recente); senão, no próximo a começar.
    const startedUnresolved = sortedAsc.slice().reverse().find((g) => now >= new Date(g.dt).getTime() && !hasResult(results[g.id]));
    const nextUp = sortedAsc.find((g) => now < new Date(g.dt).getTime());
    return startedUnresolved || nextUp || sortedAsc[sortedAsc.length - 1] || null;
  }, [sortedAsc, results, now]);
  if (!focus) return <p style={{ color: C.mut }} className="text-sm text-center py-6">Nenhum jogo cadastrado.</p>;
  const started = now >= new Date(focus.dt).getTime(); const res = results[focus.id]; const resolved = hasResult(res);
  const ms = new Date(focus.dt).getTime() - now; const cr = cravadas.find((c) => c.gameId === focus.id);
  const fmtCd = (m) => { if (m <= 0) return "começando…"; const s = Math.floor(m / 1000), d = Math.floor(s / 86400), h = Math.floor((s % 86400) / 3600), mi = Math.floor((s % 3600) / 60); if (d > 0) return d + "d " + h + "h"; if (h > 0) return h + "h " + mi + "min"; return mi + "min"; };
  const badge = resolved ? { t: "ENCERRADO", bg: C.card2, fg: C.mut } : (started ? { t: "● AO VIVO", bg: C.danger, fg: "#fff" } : { t: "EM " + fmtCd(ms), bg: C.gold, fg: "#2b2100" });
  const rows = players.map((p) => { const guess = (guessesById[p.id] || {})[focus.id]; const filled = guess && guess.h !== "" && guess.a !== ""; const sc = resolved ? scoreOf(guess, res, cfg) : null; return { p, guess, filled, sc }; }).sort((a, b) => (b.sc || 0) - (a.sc || 0) || a.p.name.localeCompare(b.p.name));
  const nextUps = sortedAsc.filter((g) => now < new Date(g.dt).getTime() && g.id !== focus.id).slice(0, 3);
  const lastDone = sortedAsc.slice().reverse().filter((g) => hasResult(results[g.id]) && g.id !== focus.id).slice(0, 3);
  return (
    <div>
      <div style={{ background: "linear-gradient(135deg, " + C.card2 + ", " + C.card + ")", border: "1px solid " + (started && !resolved ? C.danger : C.line) }} className="rounded-2xl p-4 mb-3">
        <div className="flex items-center justify-between mb-3"><span className="text-xs" style={{ color: C.mut }}>{grpLabel(focus)} · {fmtDate(focus.dt)}{focus.venue ? " · " + focus.venue : ""}</span><span className="text-xs font-bold px-2 py-1 rounded-full" style={{ background: badge.bg, color: badge.fg }}>{badge.t}</span></div>
        <div className="grid items-center" style={{ gridTemplateColumns: "1fr auto 1fr" }}>
          <div className="text-center"><div className="text-4xl">{flag(focus.home)}</div><div className="text-sm mt-1 truncate">{focus.home}</div></div>
          <div className="px-3 text-center">{resolved ? <div className="text-3xl font-extrabold" style={{ color: C.gold }}>{res.h} <span style={{ color: C.mut }}>×</span> {res.a}</div> : <div className="text-2xl font-bold" style={{ color: C.mut }}>– × –</div>}</div>
          <div className="text-center"><div className="text-4xl">{flag(focus.away)}</div><div className="text-sm mt-1 truncate">{focus.away}</div></div>
        </div>
      </div>
      {cr && <div style={{ background: "linear-gradient(135deg, " + C.gold + ", #e0a800)", color: "#2b2100" }} className="rounded-xl p-3 mb-3 text-center"><p className="text-xs font-bold">🪙 Este jogo tem CRAVADA valendo!</p></div>}
      <h3 className="font-bold text-sm mb-2" style={{ color: C.gold }}>📡 Palpites da galera</h3>
      {!started && <p className="text-xs mb-2" style={{ color: C.mut }}>🔒 O placar de cada um só aparece no apito do jogo — antes disso, mostramos apenas quem já palpitou.</p>}
      <div className="space-y-1.5">{rows.map((row) => (<div key={row.p.id} style={{ background: C.card, border: "1px solid " + (row.sc > 0 ? C.green : C.line) }} className="rounded-lg px-3 py-2 flex items-center justify-between"><span className="text-sm truncate">{row.p.name}</span><div className="flex items-center gap-3 shrink-0"><span className="text-sm font-bold" style={{ color: row.filled ? (started ? C.txt : C.green) : C.mut }}>{row.filled ? (started ? row.guess.h + " × " + row.guess.a : "✓ palpitou") : "não palpitou"}</span>{resolved && row.filled && <span className="text-xs font-bold px-2 py-0.5 rounded-full" style={{ background: row.sc > 0 ? C.green : C.card2, color: row.sc > 0 ? "#06281c" : C.mut }}>{row.sc > 0 ? "+" + row.sc : "0"}</span>}</div></div>))}</div>
      {(nextUps.length > 0 || lastDone.length > 0) && (
        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 mt-4">
          {nextUps.length > 0 && (<div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3"><p className="text-xs font-bold mb-2" style={{ color: C.gold }}>A seguir</p>{nextUps.map((g) => (<div key={g.id} className="flex items-center justify-between text-xs py-0.5"><span className="truncate">{flag(g.home)} {g.home} × {g.away} {flag(g.away)}</span><span style={{ color: C.mut }} className="shrink-0 ml-2">{fmtDate(g.dt)}</span></div>))}</div>)}
          {lastDone.length > 0 && (<div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3"><p className="text-xs font-bold mb-2" style={{ color: C.gold }}>Últimos resultados</p>{lastDone.map((g) => { const r = results[g.id]; return (<div key={g.id} className="flex items-center justify-between text-xs py-0.5"><span className="truncate">{flag(g.home)} {g.home} × {g.away} {flag(g.away)}</span><span className="shrink-0 ml-2 font-bold">{r.h}×{r.a}</span></div>); })}</div>)}
        </div>
      )}
    </div>
  );
}

// ---------- Config / Admin ----------
function Config({ cfg, saveCfg, games, renameGame, me }) {
  const [local, setLocal] = useState(cfg);
  const [tab, setTab] = useState("pontos");
  useEffect(() => setLocal(cfg), [cfg]);
  const isAdmin = ADMINS.includes(me);
  const mataOpen = cfg.mataAbre && new Date(cfg.mataAbre).getTime() <= Date.now();
  if (!isAdmin) return (<div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3 text-sm"><p style={{ color: C.mut }}>⚙️ As regras (pontuação, jogos e abertura do mata-mata) são geridas pelos organizadores — Dr. Thiago e Eduardo.</p></div>);
  const NumRow = ({ k, lb, color }) => (<div className="flex items-center justify-between py-2" style={{ borderBottom: "1px solid " + C.line }}><span className="text-sm">{lb}</span><input type="number" min="0" value={local[k]} onChange={(e) => setLocal(Object.assign({}, local, { [k]: Math.max(0, parseInt(e.target.value) || 0) }))} style={{ background: C.bg, border: "1px solid " + C.line, color: color || C.txt, width: 64 }} className="text-center py-1.5 rounded-lg outline-none font-bold" /></div>);
  return (
    <div>
      <div className="flex gap-2 mb-3 overflow-x-auto pb-1">{[["pontos", "Pontuação"], ["jogos", "Jogos"]].map((e) => (<button key={e[0]} onClick={() => setTab(e[0])} style={{ background: tab === e[0] ? C.purple : C.card, color: tab === e[0] ? "#fff" : C.mut, border: "1px solid " + C.line }} className="px-3 py-1.5 rounded-full text-xs font-medium whitespace-nowrap">{e[1]}</button>))}</div>
      <div style={{ background: C.card, border: "1px solid " + (cfg.gruposTravado ? C.danger : C.green) }} className="rounded-xl p-3 mb-3">
        <p className="text-sm font-semibold mb-1">Palpites — Fase de grupos</p>
        <p className="text-xs mb-2" style={{ color: C.mut }}>Status: <b style={{ color: cfg.gruposTravado ? C.danger : C.green }}>{cfg.gruposTravado ? "TRAVADOS" : "abertos"}</b>. Cada jogo também trava sozinho no seu apito. Trave tudo quando todos terminarem de palpitar (não há mais data fixa).</p>
        {cfg.gruposTravado
          ? <button onClick={() => saveCfg(Object.assign({}, cfg, { gruposTravado: false }))} style={{ background: C.green, color: "#06281c" }} className="w-full py-2 rounded-lg font-semibold active:opacity-80">🔓 Reabrir palpites da fase de grupos</button>
          : <button onClick={() => { if (typeof window !== "undefined" && window.confirm && !window.confirm("Travar os palpites da fase de grupos para TODOS? Ninguém poderá mais alterar (jogos já iniciados continuam travados de qualquer forma).")) return; saveCfg(Object.assign({}, cfg, { gruposTravado: true })); }} style={{ background: C.danger, color: "#fff" }} className="w-full py-2 rounded-lg font-semibold active:opacity-80">🔒 Travar palpites de todos (fase de grupos)</button>}
      </div>
      <div style={{ background: C.card, border: "1px solid " + (mataOpen ? C.green : C.line) }} className="rounded-xl p-3 mb-3">
        <p className="text-sm font-semibold mb-1">Mata-mata</p>
        <p className="text-xs mb-2" style={{ color: C.mut }}>Status: <b style={{ color: mataOpen ? C.green : C.gold }}>{mataOpen ? "ABERTO para palpites" : "fechado"}</b>. Abra só quando os confrontos estiverem definidos. Os times reais entram pela tarefa agendada ou na aba Jogos.</p>
        {mataOpen
          ? <button onClick={() => saveCfg(Object.assign({}, cfg, { mataAbre: null }))} style={{ background: C.card2, color: C.danger, border: "1px solid " + C.line }} className="w-full py-2 rounded-lg font-semibold active:opacity-80">🔒 Fechar mata-mata</button>
          : <button onClick={() => saveCfg(Object.assign({}, cfg, { mataAbre: new Date().toISOString() }))} style={{ background: C.green, color: "#06281c" }} className="w-full py-2 rounded-lg font-semibold active:opacity-80">🔓 Abrir mata-mata agora</button>}
      </div>
      {tab === "pontos" && (
        <div style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-3">
          <NumRow k="pExact" lb="Placar exato" color={C.green} /><NumRow k="pDiff" lb="Vencedor + saldo" color={C.green} /><NumRow k="pWin" lb="Só o vencedor / empate" color={C.green} /><NumRow k="cravadaBase" lb="🎯 Valor base da Cravada" color={C.gold} />
          <div className="flex items-center justify-between py-2"><span className="text-sm">Unidade do prêmio</span><input value={local.unit} onChange={(e) => setLocal(Object.assign({}, local, { unit: e.target.value.slice(0, 6) }))} style={{ background: C.bg, border: "1px solid " + C.line, color: C.gold, width: 80 }} className="text-center py-1.5 rounded-lg outline-none font-bold" /></div>
          <button onClick={() => saveCfg(local)} style={{ background: C.green, color: "#06281c" }} className="w-full mt-3 py-2.5 rounded-lg font-semibold active:opacity-80">Salvar regras</button>
        </div>
      )}
      {tab === "jogos" && <GameAdmin games={games} renameGame={renameGame} />}
    </div>
  );
}
function GameAdmin({ games, renameGame }) {
  const [editing, setEditing] = useState(null);
  const [h, setH] = useState(""); const [a, setA] = useState("");
  const list = games.filter((g) => g.round > 3);
  const start = (g) => { setEditing(g.id); setH(g.home); setA(g.away); };
  const save = () => { renameGame(editing, h, a); setEditing(null); };
  return (
    <div>
      <div style={{ background: C.card2, border: "1px solid " + C.line }} className="rounded-lg p-3 mb-3 text-xs"><p style={{ color: C.mut }}>Conforme o mata-mata se define, renomeie as vagas "A definir" pelos times reais. Os palpites já feitos continuam grudados em cada jogo.</p></div>
      {list.map((g) => editing === g.id ? (
        <div key={g.id} style={{ background: C.card, border: "1px solid " + C.blue }} className="rounded-xl p-3 mb-2 space-y-2">
          <div className="grid grid-cols-2 gap-2"><input value={h} onChange={(e) => setH(e.target.value)} style={{ background: C.bg, border: "1px solid " + C.line, color: C.txt }} className="px-2 py-1.5 rounded-lg outline-none text-sm" /><input value={a} onChange={(e) => setA(e.target.value)} style={{ background: C.bg, border: "1px solid " + C.line, color: C.txt }} className="px-2 py-1.5 rounded-lg outline-none text-sm" /></div>
          <div className="flex gap-2"><button onClick={save} style={{ background: C.green, color: "#06281c" }} className="flex-1 py-2 rounded-lg font-semibold">Salvar</button><button onClick={() => setEditing(null)} style={{ background: C.card2, color: C.mut }} className="px-4 rounded-lg">Cancelar</button></div>
        </div>
      ) : (
        <div key={g.id} style={{ background: C.card, border: "1px solid " + C.line }} className="rounded-xl p-2.5 mb-2 flex items-center justify-between">
          <div className="min-w-0"><p className="text-sm truncate">{flag(g.home)} {g.home} × {g.away} {flag(g.away)}</p><p className="text-xs" style={{ color: C.mut }}>{grpLabel(g)} · {fmtDate(g.dt)}</p></div>
          <button onClick={() => start(g)} style={{ background: C.card2, color: C.blue }} className="px-2 py-1 rounded-lg text-xs active:opacity-70">editar</button>
        </div>
      ))}
    </div>
  );
}

ReactDOM.createRoot(document.getElementById("root")).render(<App />);
