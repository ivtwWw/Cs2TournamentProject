document.addEventListener("DOMContentLoaded", () => {
    const container = document.getElementById('series-detail');
    const seriesId = new URLSearchParams(window.location.search).get('id');
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));

    const stageOrder = (stage) => {
        const name = String(stage || '').toLowerCase();
        if (/总决赛|grand[\s-]*final/.test(name)) return 0;
        if (/季军|第三名|third[\s-]*place|bronze/.test(name)) return 1;
        if (/半决赛|semi[\s-]*final|semi\b/.test(name)) return 2;
        if (/四分之一|八强|quarter[\s-]*final|quarter\b/.test(name)) return 3;
        if (/小组|group/.test(name)) return 4;
        if (/(^|[^a-z])final\b/.test(name)) return 0;
        return 5;
    };

    const cleanMapName = (name) => {
        const cleaned = String(name || '').replace(/\bde_/gi, '').replace(/_/g, ' ').trim();
        const knownNames = {
            dust2: 'Dust II',
            'dust 2': 'Dust II',
            'dust ii': 'Dust II',
            mirage: 'Mirage',
            vertigo: 'Vertigo',
            nuke: 'Nuke',
            ancient: 'Ancient',
            inferno: 'Inferno',
            anubis: 'Anubis',
            overpass: 'Overpass',
            train: 'Train',
            cache: 'Cache'
        };
        return knownNames[cleaned.toLowerCase()] || cleaned;
    };

    const getMaps = (match) => {
        const maps = match.maps || match.details?.maps;
        if (Array.isArray(maps) && maps.length) return maps;

        const mapText = match.map || match.info || '';
        return mapText.split(/\s*\/\s*/).map((entry) => {
            const parsed = entry.match(/^(.*?)\s*\((\d+\s*[:/-]\s*\d+)\)$/);
            return parsed
                ? { name: parsed[1], score: parsed[2] }
                : { name: entry, score: '' };
        }).filter((map) => map.name);
    };

    const renderMapList = (match) => {
        const maps = getMaps(match);
        const mapNames = maps.map((map) => cleanMapName(map.name)).filter(Boolean);
        const mapText = mapNames.length
            ? `地图：${mapNames.join(', ')}`
            : cleanMapName(match.info || match.map || '');
        return mapText ? `<p>${escapeHtml(mapText)}</p>` : '';
    };

    const getFinalMatch = (matches) => matches.find((match) =>
        /总决赛|grand[\s-]*final/i.test(match.stage || '')
    );

    const getChampionPlayers = (finalMatch, champion) => {
        const players = new Map();
        const maps = finalMatch?.maps || finalMatch?.details?.maps || [];
        const teams = maps.length
            ? maps.flatMap((map) => map.teams || [])
            : finalMatch?.details?.teams || [];
        teams.filter((team) => team.name === champion).forEach((team) => {
            (team.players || []).forEach((player) => {
                const key = player.playerId || player.nickname;
                if (key && !players.has(key)) players.set(key, player);
            });
        });
        return Array.from(players.values());
    };

    const getAwardAvatar = (person, players) => {
        if (person?.avatar) return person.avatar;
        const player = players.find((candidate) =>
            (person?.playerId && candidate.playerId === person.playerId)
            || (person?.nickname && candidate.nickname === person.nickname)
        );
        return player?.avatar || '';
    };

    const getPlayerTotals = (matches, playerInfo) => {
        const targetId = playerInfo.playerId;
        const targetName = playerInfo.nickname;
        const totals = { Kills: 0, Deaths: 0, Assists: 0, Headshots: 0, MVPs: 0, adrDamage: 0, rounds: 0 };
        let found = false;
        matches.forEach((match) => {
            const maps = match.maps || match.details?.maps || [];
            const sourceMaps = maps.length ? maps : [{
                score: match.score,
                teams: match.details?.teams || []
            }];
            sourceMaps.forEach((map) => {
                const scoreParts = String(map.score || '').split(/\s*[-/:]\s*/).map(Number);
                const rounds = scoreParts.length === 2 && scoreParts.every(Number.isFinite)
                    ? scoreParts[0] + scoreParts[1]
                    : 0;
                (map.teams || []).forEach((team) => {
                    (team.players || []).forEach((player) => {
                        const isPlayer = targetId
                            ? player.playerId === targetId
                            : player.nickname === targetName;
                        if (!isPlayer) return;
                        found = true;
                        ['Kills', 'Deaths', 'Assists', 'Headshots', 'MVPs'].forEach((key) => {
                            const value = Number(player.stats?.[key] ?? player[key]);
                            if (Number.isFinite(value)) totals[key] += value;
                        });
                        const adr = Number(player.stats?.ADR ?? player.ADR);
                        if (Number.isFinite(adr) && rounds > 0) {
                            totals.adrDamage += adr * rounds;
                            totals.rounds += rounds;
                        }
                    });
                });
            });
        });
        if (!found) return null;
        return {
            ...totals,
            kd: totals.Deaths ? (totals.Kills / totals.Deaths).toFixed(2) : '-',
            hs: totals.Kills ? `${Math.round((totals.Headshots / totals.Kills) * 100)}%` : '-',
            adr: totals.rounds ? (totals.adrDamage / totals.rounds).toFixed(1) : '-'
        };
    };

    const renderAvatar = (player) => {
        const nickname = player.nickname || '选手';
        const avatarValue = player.avatar || '';
        const avatar = /^https:\/\/distribution\.faceit-cdn\.net\/images\/[A-Za-z0-9._/?=&%-]+$/i.test(avatarValue)
            || /^assets\/images\/players\/[A-Za-z0-9_-]+\.(?:jpg|png|gif|webp)$/i.test(avatarValue)
            ? avatarValue
            : '';
        return `<span class="champion-avatar">
            <img class="champion-avatar-fallback" src="assets/images/default-avatar.svg" alt="">
            ${avatar ? `<img src="${escapeHtml(avatar)}" alt="${escapeHtml(nickname)} 头像" loading="lazy" hidden>` : ''}
        </span>`;
    };

    const faceitProfileUrl = (player) => {
        const profileName = player.nickname || player.playerId;
        return profileName
            ? `https://www.faceit.com/en/players/${encodeURIComponent(profileName)}`
            : '';
    };

    const renderPlayerLink = (player, label) => {
        const url = faceitProfileUrl(player);
        return url
            ? `<a class="faceit-player-link" href="${escapeHtml(url)}" target="_blank" rel="noopener noreferrer">${escapeHtml(label)}</a>`
            : escapeHtml(label);
    };

    const renderChampionDetails = (series, matches, finalMatch) => {
        const champion = series.championTeam || finalMatch?.winner;
        if (!champion) return '';

        const captain = series.captain || {};
        const mvp = series.mvp || {};
        const players = Array.isArray(series.championPlayers) && series.championPlayers.length
            ? series.championPlayers
            : getChampionPlayers(finalMatch, champion);
        const captainKey = captain.playerId || captain.nickname;
        const isCaptainPlayer = (player) => captainKey
            && (player.playerId === captainKey || player.nickname === captainKey);
        const isMvpPlayer = (player) => (mvp.playerId && player.playerId === mvp.playerId)
            || (mvp.nickname && player.nickname === mvp.nickname);
        const sameAwardedPlayer = (first, second) => Boolean(
            (first?.playerId && second?.playerId && first.playerId === second.playerId)
            || (first?.nickname && second?.nickname && first.nickname === second.nickname)
        );
        const captainAvatar = getAwardAvatar(captain, players);
        const mvpAvatar = getAwardAvatar(mvp, players);
        const sharedAwardAvatar = sameAwardedPlayer(captain, mvp)
            ? captainAvatar || mvpAvatar
            : '';
        const orderedPlayers = [...players].sort((first, second) => {
            const priority = (player) => isCaptainPlayer(player) ? 0 : isMvpPlayer(player) ? 1 : 2;
            return priority(first) - priority(second);
        });
        const roster = orderedPlayers.map((player) => {
            const isCaptain = isCaptainPlayer(player);
            const isMvp = isMvpPlayer(player);
            const avatar = (isCaptain ? captainAvatar : '')
                || (isMvp ? mvpAvatar : '')
                || sharedAwardAvatar
                || player.avatar;
            return `<li class="champion-player">
                ${renderAvatar({ ...player, avatar })}
                <span class="champion-player-name">${escapeHtml(player.nickname || '未知选手')}
                    ${isCaptain ? '<span class="captain-badge">队长</span>' : ''}
                    ${isMvp ? '<span class="mvp-badge">MVP</span>' : ''}
                </span>
                ${renderPlayerLink(player, 'FACEIT 选手主页 ↗')}
            </li>`;
        }).join('');

        const mvpStats = mvp.nickname || mvp.playerId ? getPlayerTotals(matches, mvp) : null;
        const mvpProfile = { ...mvp, avatar: mvpAvatar || sharedAwardAvatar };
        const mvpPanel = mvp.nickname || mvp.playerId
            ? `<article class="award-panel">
                <h3>本届 MVP</h3>
                <div class="award-player">${renderAvatar(mvpProfile)}<strong>${renderPlayerLink(mvp, mvp.nickname || '未知选手')}</strong>
                    ${isCaptainPlayer(mvp) ? '<span class="captain-badge">队长</span>' : ''}
                    <span class="mvp-badge">MVP</span>
                </div>
                <div class="player-tournament-stats">
                    <span><strong>${escapeHtml(mvp.rating || '未录入')}</strong>Rating</span>
                    <span><strong>${mvpStats ? mvpStats.kd : '-'}</strong>K/D</span>
                    <span><strong>${mvpStats ? mvpStats.Kills : '-'}</strong>击杀</span>
                    <span><strong>${mvpStats ? mvpStats.Deaths : '-'}</strong>死亡</span>
                    <span><strong>${mvpStats ? mvpStats.Assists : '-'}</strong>助攻</span>
                    <span><strong>${mvpStats ? mvpStats.adr : '-'}</strong>ADR</span>
                    <span><strong>${mvpStats ? mvpStats.hs : '-'}</strong>爆头率</span>
                    <span><strong>${mvpStats ? mvpStats.MVPs : '-'}</strong>单场 MVP</span>
                </div>
            </article>`
            : '<p class="empty-state">MVP 尚未登记，可在本地管理菜单中补充。</p>';

        return `<section class="series-awards">
            <h2>🏆 冠军与个人荣誉</h2>
            <div class="champion-overview card">
                <div class="champion-heading">
                    <span class="trophy-mark" aria-hidden="true">🏆</span>
                    <div><span>冠军队伍</span><h3>${escapeHtml(champion)}</h3></div>
                </div>
                <h3 class="roster-heading">冠军队成员</h3>
                ${roster.length
                    ? `<ul class="champion-roster">${roster}</ul>`
                    : '<p class="empty-state">总决赛尚无可用的选手资料。</p>'}
            </div>
            ${mvpPanel}
        </section>`;
    };

    const revealLoadedAvatars = (root) => {
        root.querySelectorAll('.champion-avatar img:not(.champion-avatar-fallback)').forEach((image) => {
            const revealImage = () => {
                image.hidden = false;
                const fallback = image.previousElementSibling;
                if (fallback) fallback.hidden = true;
            };
            image.addEventListener('load', revealImage, { once: true });
            image.addEventListener('error', () => image.remove(), { once: true });
            if (image.complete && image.naturalWidth) revealImage();
        });
    };

    fetch('data/matches.json')
        .then((response) => {
            if (!response.ok) throw new Error(`HTTP ${response.status}`);
            return response.json();
        })
        .then((data) => {
            const series = (data.series || []).find((item) => item.id === seriesId);
            if (!series) {
                container.innerHTML = '<p class="error-message">找不到这届赛事。</p>';
                return;
            }

            const matches = [...(series.matches || [])]
                .sort((first, second) => stageOrder(first.stage) - stageOrder(second.stage));
            const finalMatch = getFinalMatch(matches);
            const description = series.eventTime || series.schedule
                ? series.title
                : series.description || '';
            const matchCards = matches.map((match) => `
                <a class="card match-result match-link" href="match.html?id=${encodeURIComponent(match.id)}&series=${encodeURIComponent(series.id)}">
                    <div class="match-info">
                        <h3>${escapeHtml(match.stage)}</h3>
                        ${renderMapList(match)}
                    </div>
                    <div class="score-board">
                        <span class="score-team score-team-a ${match.winner === match.teamA ? 'winner' : ''}">${escapeHtml(match.teamA)}</span>
                        <span class="score">${escapeHtml(match.score)}</span>
                        <span class="score-team score-team-b ${match.winner === match.teamB ? 'winner' : ''}">${escapeHtml(match.teamB)}</span>
                    </div>
                    <span class="details-hint">查看详情 →</span>
                </a>
            `).join('');

            container.innerHTML = `
                <a class="back-link" href="history.html">← 返回历届赛事</a>
                <section class="series-page-heading">
                    <p class="series-status status-${escapeHtml(series.status || 'completed')}">
                        ${series.status === 'upcoming' ? '即将开始' : series.status === 'active' ? '进行中' : '已结束'}
                    </p>
                    <h2>${escapeHtml(series.title)}</h2>
                    ${description ? `<p>${escapeHtml(description)}</p>` : ''}
                    ${series.eventTime ? `<p class="series-schedule-meta"><strong>比赛时间：</strong>${escapeHtml(series.eventTime)}</p>` : ''}
                    ${series.schedule ? `<p class="series-schedule-meta"><strong>赛程信息：</strong>${escapeHtml(series.schedule)}</p>` : ''}
                    <div class="series-page-stats">
                        <span>${matches.length}</span>
                        <span>场比赛</span>
                    </div>
                    ${series.status === 'upcoming'
                        ? '<a class="registration-cta" href="registration.html">查看报名方式 →</a>'
                        : ''}
                </section>
                ${series.status === 'completed' ? renderChampionDetails(series, matches, finalMatch) : ''}
                <section>
                    <h2>比赛列表</h2>
                    ${matchCards || '<p class="empty-state">本届赛事尚未添加比赛。</p>'}
                </section>
            `;
            revealLoadedAvatars(container);
        })
        .catch((error) => {
            console.error('加载系列赛失败:', error);
            container.innerHTML = '<p class="error-message">赛事数据加载失败，请稍后重试。</p>';
        });
});
