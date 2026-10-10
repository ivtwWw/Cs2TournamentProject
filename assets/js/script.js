document.addEventListener("DOMContentLoaded", () => {
    const escapeHtml = (value) => String(value ?? '').replace(/[&<>"']/g, (character) => ({
        '&': '&amp;',
        '<': '&lt;',
        '>': '&gt;',
        '"': '&quot;',
        "'": '&#039;'
    }[character]));

    const renderAwardPerson = (person, label) => {
        const nickname = person?.nickname || '待登记';
        const avatar = /^https?:\/\//i.test(person?.avatar || '') ? person.avatar : '';
        const initials = Array.from(nickname).slice(0, 2).join('');
        return `<span class="series-card-award-person">
            <strong>${label}</strong>
            ${person?.nickname ? `<span class="series-card-avatar">
                <span class="series-card-avatar-fallback">${escapeHtml(initials)}</span>
                ${avatar ? `<img src="${escapeHtml(avatar)}" alt="">` : ''}
            </span>` : ''}
            <span>${escapeHtml(nickname)}</span>
        </span>`;
    };

    const samePlayer = (first, second) => Boolean(
        (first?.playerId && second?.playerId && first.playerId === second.playerId)
        || (first?.nickname && second?.nickname && first.nickname === second.nickname)
    );

    const getAwardAvatar = (series, person, finalMatch, champion) => {
        if (person?.avatar) return person.avatar;
        const savedPlayers = Array.isArray(series.championPlayers) ? series.championPlayers : [];
        const maps = finalMatch?.maps || finalMatch?.details?.maps || [];
        const teams = maps.length
            ? maps.flatMap((map) => map.teams || [])
            : finalMatch?.details?.teams || [];
        const matchPlayers = teams
            .filter((team) => team.name === champion)
            .flatMap((team) => team.players || []);
        const player = [...savedPlayers, ...matchPlayers].find((candidate) =>
            samePlayer(candidate, person)
        );
        return player?.avatar || '';
    };

    const revealLoadedAvatars = (root) => {
        root.querySelectorAll('.series-card-avatar img').forEach((image) => {
            const revealImage = () => {
                image.classList.add('is-loaded');
                image.previousElementSibling.classList.add('is-hidden');
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
            const upcomingContainer = document.getElementById('upcoming-series');
            const historyContainer = document.getElementById('series-list');
            const series = [...(data.series || [])].reverse();
            const upcoming = series.filter((item) => item.status === 'upcoming' || item.status === 'active');
            const history = series.filter((item) => item.status !== 'upcoming' && item.status !== 'active');

            const renderSeries = (items) => items.map((item) => {
                const matchCount = item.matches?.length || 0;
                const href = `series.html?id=${encodeURIComponent(item.id)}`;
                const status = item.status === 'upcoming'
                    ? '即将开始'
                    : item.status === 'active' ? '进行中' : '已结束';
                const description = item.eventTime || item.schedule
                    ? item.title
                    : item.description || '点击查看本届比赛与选手数据。';
                const finalMatch = (item.matches || []).find((match) =>
                    /总决赛|grand[\s-]*final/i.test(match.stage || '')
                );
                const champion = item.championTeam || finalMatch?.winner;
                const captain = item.captain || {};
                const mvp = item.mvp || {};
                const cardCaptain = {
                    ...captain,
                    avatar: getAwardAvatar(item, captain, finalMatch, champion)
                };
                const cardMvp = {
                    ...mvp,
                    avatar: getAwardAvatar(item, mvp, finalMatch, champion)
                };
                const scheduleInfo = [
                    item.eventTime
                        ? `<p class="series-card-meta"><strong>比赛时间</strong>${escapeHtml(item.eventTime)}</p>`
                        : '',
                    item.schedule
                        ? `<p class="series-card-meta"><strong>赛程信息</strong>${escapeHtml(item.schedule)}</p>`
                        : ''
                ].join('');
                const winners = status === '已结束'
                    ? `<div class="series-card-awards">
                        <span><strong>冠军</strong>${escapeHtml(champion || '待登记')}</span>
                        ${renderAwardPerson(cardCaptain, '队长')}
                        ${renderAwardPerson(cardMvp, 'MVP')}
                    </div>`
                    : '';
                return `
                    <a class="card series-card" href="${href}">
                        <div class="series-card-heading">
                            <h3>${escapeHtml(item.title)}</h3>
                            <span class="series-status status-${escapeHtml(item.status || 'completed')}">${status}</span>
                        </div>
                        <p>${escapeHtml(description)}</p>
                        ${scheduleInfo}
                        ${winners}
                        <span class="series-card-footer">${matchCount} 场比赛 <span>进入赛事 →</span></span>
                    </a>
                `;
            }).join('');

            if (upcomingContainer) {
                upcomingContainer.innerHTML = upcoming.length
                    ? renderSeries(upcoming)
                    : '<p class="empty-state">暂时没有即将开始或进行中的赛事。</p>';
            }
            if (historyContainer) {
                const limit = Number(historyContainer.dataset.seriesLimit);
                const visibleHistory = Number.isInteger(limit) && limit > 0
                    ? history.slice(0, limit)
                    : history;
                historyContainer.innerHTML = visibleHistory.length
                    ? renderSeries(visibleHistory)
                    : '<p class="empty-state">暂无已结束的赛事。</p>';
            }
            revealLoadedAvatars(document);
        })
        .catch((error) => {
            console.error('加载系列赛数据失败:', error);
            const upcomingContainer = document.getElementById('upcoming-series');
            const historyContainer = document.getElementById('series-list');
            if (upcomingContainer) {
                upcomingContainer.innerHTML =
                    '<p class="error-message">赛事数据加载失败，请稍后重试。</p>';
            }
            if (historyContainer) {
                historyContainer.innerHTML =
                    '<p class="error-message">赛事数据加载失败，请稍后重试。</p>';
            }
        });
});
