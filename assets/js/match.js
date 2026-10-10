document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('match-detail');
    const params = new URLSearchParams(window.location.search);
    const matchId = params.get('id');
    const requestedSeriesId = params.get('series');

    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));

    const stat = (player, key) => player.stats?.[key] ?? player[key] ?? '-';

    const aggregateTeams = (maps) => {
        const teams = new Map();
        maps.forEach((map) => {
            (map.teams || []).forEach((team) => {
                if (!teams.has(team.name)) teams.set(team.name, new Map());
                const players = teams.get(team.name);
                (team.players || []).forEach((player) => {
                    const key = player.playerId || player.nickname;
                    if (!players.has(key)) {
                        players.set(key, {
                            nickname: player.nickname,
                            playerId: player.playerId,
                            stats: {
                                Kills: 0,
                                Deaths: 0,
                                Assists: 0,
                                Headshots: 0,
                                MVPs: 0,
                                ADRWeighted: 0,
                                roundsPlayed: 0
                            }
                        });
                    }
                    const combined = players.get(key);
                    ['Kills', 'Deaths', 'Assists', 'Headshots', 'MVPs'].forEach((name) => {
                        const value = Number(player.stats?.[name]);
                        if (Number.isFinite(value)) combined.stats[name] += value;
                    });
                    const adr = Number(player.stats?.ADR);
                    const [scoreA, scoreB] = splitScore(map.score);
                    const rounds = Number(scoreA) + Number(scoreB);
                    if (Number.isFinite(adr) && Number.isFinite(rounds) && rounds > 0) {
                        combined.stats.ADRWeighted += adr * rounds;
                        combined.stats.roundsPlayed += rounds;
                    }
                });
            });
        });

        return Array.from(teams, ([name, players]) => ({
            name,
            players: Array.from(players.values()).map((player) => ({
                ...player,
                stats: {
                    ...player.stats,
                    'K/D Ratio': player.stats.Deaths
                        ? (player.stats.Kills / player.stats.Deaths).toFixed(2)
                        : '-',
                    'Headshots %': player.stats.Kills
                        ? Math.round((player.stats.Headshots / player.stats.Kills) * 100)
                        : '-',
                    ADR: player.stats.roundsPlayed
                        ? (player.stats.ADRWeighted / player.stats.roundsPlayed).toFixed(1)
                        : '-'
                }
            }))
        }));
    };

    const renderTeams = (teams, winner) => {
        if (!teams?.length) {
            return '<div class="card empty-state">这张地图暂无选手统计数据。</div>';
        }

        return teams.map((team) => `
            <section class="team-detail card">
                <h3 class="${team.name === winner ? 'winner' : ''}">${escapeHtml(team.name)}</h3>
                <div class="table-wrapper">
                    <table class="player-stats-table">
                        <colgroup>
                            <col class="player-name-column">
                            <col span="7" class="player-stat-column">
                        </colgroup>
                        <thead><tr>
                            <th>选手</th><th>K</th><th>D</th><th>A</th>
                            <th>K/D</th><th>爆头率</th><th>ADR</th><th>MVP</th>
                        </tr></thead>
                        <tbody>${(team.players || []).map((player) => `
                            <tr>
                                <td>${escapeHtml(player.nickname)}</td>
                                <td>${escapeHtml(stat(player, 'Kills'))}</td>
                                <td>${escapeHtml(stat(player, 'Deaths'))}</td>
                                <td>${escapeHtml(stat(player, 'Assists'))}</td>
                                <td>${escapeHtml(stat(player, 'K/D Ratio'))}</td>
                                <td>${escapeHtml(stat(player, 'Headshots %'))}${stat(player, 'Headshots %') === '-' ? '' : '%'}</td>
                                <td>${escapeHtml(stat(player, 'ADR'))}</td>
                                <td>${escapeHtml(stat(player, 'MVPs'))}</td>
                            </tr>
                        `).join('')}</tbody>
                    </table>
                </div>
            </section>
        `).join('');
    };

    const splitScore = (score) => {
        const parts = String(score || '').split(/\s*[-/:]\s*/);
        return parts.length === 2 ? parts : [score || '-', '-'];
    };

    const renderOverview = (match, maps) => {
        const [teamAScore, teamBScore] = splitScore(match.score);
        const mapCards = maps.length
            ? maps.map((map, index) => `
                <button class="map-card" type="button" data-view="${index}">
                    <span class="map-card-score">${escapeHtml(map.score || '比分待定')}</span>
                    <span class="map-card-name">${escapeHtml(map.name || `地图 ${index + 1}`)}</span>
                </button>
            `).join('')
            : '<p class="empty-state">没有逐图统计数据。单张 FACEIT 比赛同步后显示在这里；BO3 请逐张同步每个地图对应的 FACEIT Match ID。</p>';

        return `
            <section class="series-score card">
                <div class="series-team ${match.winner === match.teamA ? 'winner' : ''}">${escapeHtml(match.teamA)}</div>
                <div class="series-score-center">
                    <span class="series-format">${escapeHtml(match.format || (maps.length > 1 ? 'BO3' : '比赛'))}</span>
                    <strong>${escapeHtml(teamAScore)} <i>:</i> ${escapeHtml(teamBScore)}</strong>
                    <span class="series-status">${escapeHtml(match.stage)}</span>
                </div>
                <div class="series-team ${match.winner === match.teamB ? 'winner' : ''}">${escapeHtml(match.teamB)}</div>
            </section>
            <div class="map-selector">
                <button class="map-card is-active" type="button" data-view="overview">
                    <span class="map-card-score">总览</span>
                    <span class="map-card-name">系列赛</span>
                </button>
                ${mapCards}
            </div>
            <section id="selected-map-data" class="selected-map-data"></section>
        `;
    };

    const renderMap = (match, map, index) => {
        const mapName = map.name || `地图 ${index + 1}`;
        let [scoreA, scoreB] = splitScore(map.score);
        let teams = map.teams || [];
        if (map.teamA === match.teamB && map.teamB === match.teamA) {
            [scoreA, scoreB] = [scoreB, scoreA];
            teams = [...teams].reverse();
        }
        const winner = map.winner || '';
        return `
            <section class="map-summary card">
                <p>${escapeHtml(match.stage)} · ${escapeHtml(mapName)}</p>
                <div class="map-score-line">
                    <span class="${winner === match.teamA ? 'winner' : ''}">${escapeHtml(match.teamA)}</span>
                    <strong>${escapeHtml(scoreA)} <i>:</i> ${escapeHtml(scoreB)}</strong>
                    <span class="${winner === match.teamB ? 'winner' : ''}">${escapeHtml(match.teamB)}</span>
                </div>
            </section>
            ${renderTeams(teams, winner)}
        `;
    };

    if (!matchId) {
        container.innerHTML = '<p class="error-message">缺少比赛 ID。</p>';
        return;
    }

    fetch('data/matches.json')
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            const series = (data.series || []).find((item) =>
                (!requestedSeriesId || item.id === requestedSeriesId)
                && (item.matches || []).some((match) => match.id === matchId)
            );
            const match = series
                ? series.matches.find((item) => item.id === matchId)
                : (data.matches || []).find((item) => item.id === matchId);
            if (!match) {
                container.innerHTML = '<p class="error-message">找不到这场比赛。</p>';
                return;
            }

            let maps = match.maps || [];
            if (!maps.length && match.details?.teams?.length) {
                maps = [{
                    name: (match.info || match.map || '').replace(/^地图:\s*/, ''),
                    score: match.score,
                    winner: match.winner,
                    teams: match.details.teams
                }];
            }
            if (!maps.length) {
                const legacyMapText = match.map || match.info || '';
                maps = legacyMapText.split(/\s*\/\s*/).flatMap((entry) => {
                    const parsed = entry.match(/^(.*?)\s*\((\d+)\s*[:/-]\s*(\d+)\)$/);
                    if (!parsed) return [];
                    const scoreA = Number(parsed[2]);
                    const scoreB = Number(parsed[3]);
                    return [{
                        name: parsed[1].trim(),
                        score: `${scoreA} - ${scoreB}`,
                        winner: scoreA === scoreB
                            ? ''
                            : scoreA > scoreB ? match.teamA : match.teamB,
                        teamA: match.teamA,
                        teamB: match.teamB,
                        teams: []
                    }];
                });
            }
            const faceitLink = match.faceitUrl
                ? `<a class="btn" href="${escapeHtml(match.faceitUrl)}" target="_blank" rel="noopener">在 FACEIT 查看</a>`
                : '';
            const isSeries = match.format === 'BO3' || maps.length > 1;
            const backUrl = series
                ? `series.html?id=${encodeURIComponent(series.id)}`
                : 'history.html';

            if (!isSeries) {
                const singleMap = maps[0] || {
                    name: (match.info || match.map || '').replace(/^地图:\s*/, ''),
                    score: match.score,
                    winner: match.winner,
                    teams: match.details?.teams || []
                };
                container.innerHTML = `
                    <a class="back-link" href="${backUrl}">← 返回赛事</a>
                    <div class="match-heading">
                        <p class="match-stage">${escapeHtml(match.stage)}</p>
                        <p>${escapeHtml(match.info || match.map || '')}</p>
                        ${faceitLink}
                    </div>
                    ${renderMap(match, singleMap, 0)}
                `;
                return;
            }

            container.innerHTML = `
                <a class="back-link" href="${backUrl}">← 返回赛事</a>
                <div class="match-heading">
                    <p class="match-stage">${escapeHtml(match.stage)}</p>
                    <p>${escapeHtml(match.info || match.map || '')}</p>
                    ${faceitLink}
                </div>
                ${renderOverview(match, maps)}
            `;

            const selectedData = container.querySelector('#selected-map-data');
            const selector = container.querySelector('.map-selector');
            const showView = (view) => {
                selector.querySelectorAll('.map-card').forEach((button) => {
                    button.classList.toggle('is-active', button.dataset.view === String(view));
                });
                if (view === 'overview') {
                    const teams = maps.length > 1
                        ? aggregateTeams(maps)
                        : maps.length === 1 ? maps[0].teams : [];
                    selectedData.innerHTML = teams.length
                        ? `<h2 class="view-title">系列赛选手总览</h2>${renderTeams(teams, match.winner)}`
                        : `<div class="card empty-state">选择上方地图卡片查看该图的比分和选手数据。</div>`;
                } else {
                    const mapIndex = Number(view);
                    selectedData.innerHTML = renderMap(match, maps[mapIndex], mapIndex);
                }
            };

            selector.addEventListener('click', (event) => {
                const button = event.target.closest('.map-card');
                if (button) showView(button.dataset.view);
            });
            showView('overview');
        })
        .catch((error) => {
            console.error('加载比赛详情失败:', error);
            container.innerHTML = '<p class="error-message">加载比赛详情失败，请稍后重试。</p>';
        });
});
