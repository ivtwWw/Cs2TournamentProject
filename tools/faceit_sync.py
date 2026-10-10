import hashlib
import json
import os
import re
import tempfile
from functools import lru_cache
from pathlib import Path
from urllib.parse import urlparse

import requests


FACEIT_API_KEY_ENV = "FACEIT_API_KEY"
PROJECT_ROOT = Path(__file__).resolve().parent.parent
JSON_FILE = Path(__file__).resolve().parent.parent / "data" / "matches.json"
AVATAR_DIRECTORY = PROJECT_ROOT / "assets" / "images" / "players"
MAX_AVATAR_SIZE = 5 * 1024 * 1024


@lru_cache(maxsize=512)
def download_avatar(avatar_url, player_id):
    """将 FACEIT 头像下载为不可变的本地图片快照，并返回站点内相对路径。"""
    parsed_url = urlparse(avatar_url)
    if (
        parsed_url.scheme != "https"
        or parsed_url.hostname != "distribution.faceit-cdn.net"
        or parsed_url.username is not None
        or parsed_url.password is not None
        or not parsed_url.path.startswith("/images/")
    ):
        raise ValueError("头像地址必须是 FACEIT CDN 的 HTTPS 图片地址。")

    response = None
    try:
        response = requests.get(
            avatar_url,
            timeout=20,
            stream=True,
            allow_redirects=False,
        )
        if response.status_code != 200:
            raise RuntimeError(f"头像图片请求失败：HTTP {response.status_code}")

        content_length = response.headers.get("Content-Length")
        if content_length:
            try:
                if int(content_length) > MAX_AVATAR_SIZE:
                    raise RuntimeError("头像图片超过 5 MB，未保存。")
            except ValueError as error:
                raise RuntimeError("头像图片响应包含无效的 Content-Length。") from error

        chunks = []
        size = 0
        for chunk in response.iter_content(chunk_size=64 * 1024):
            if not chunk:
                continue
            size += len(chunk)
            if size > MAX_AVATAR_SIZE:
                raise RuntimeError("头像图片超过 5 MB，未保存。")
            chunks.append(chunk)
    except requests.exceptions.RequestException as error:
        raise RuntimeError(f"头像图片下载失败：{error}") from error
    finally:
        if response is not None:
            response.close()

    image_data = b"".join(chunks)
    image_type = None
    if image_data.startswith(b"\xff\xd8\xff"):
        image_type = "jpg"
    elif image_data.startswith(b"\x89PNG\r\n\x1a\n"):
        image_type = "png"
    elif image_data.startswith((b"GIF87a", b"GIF89a")):
        image_type = "gif"
    elif (
        len(image_data) >= 12
        and image_data[:4] == b"RIFF"
        and image_data[8:12] == b"WEBP"
    ):
        image_type = "webp"
    if not image_type:
        raise RuntimeError("下载内容不是受支持的图片格式，未保存。")

    image_hash = hashlib.sha256(image_data).hexdigest()[:16]
    safe_player_id = re.sub(r"[^A-Za-z0-9_-]", "_", str(player_id or "player"))[:80]
    filename = f"{safe_player_id}-{image_hash}.{image_type}"
    destination = AVATAR_DIRECTORY / filename
    AVATAR_DIRECTORY.mkdir(parents=True, exist_ok=True)
    if not destination.exists():
        temporary_path = None
        try:
            with tempfile.NamedTemporaryFile(
                mode="wb",
                dir=AVATAR_DIRECTORY,
                delete=False,
                suffix=".tmp",
            ) as file:
                file.write(image_data)
                temporary_path = file.name
            os.replace(temporary_path, destination)
        finally:
            if temporary_path and os.path.exists(temporary_path):
                os.remove(temporary_path)

    return destination.relative_to(PROJECT_ROOT).as_posix()


def parse_player_stats(stats_data, factions):
    """将 FACEIT stats 中每张地图的队伍和选手数据转换为页面结构。"""
    maps = []
    faction_names = {faction.get("faction_id"): faction.get("name") for faction in factions}
    player_profiles = {}
    for faction in factions:
        for profile in faction.get("players", []):
            player_id = profile.get("player_id") or profile.get("playerId")
            if player_id:
                player_profiles[player_id] = profile

    for index, round_data in enumerate(stats_data.get("rounds", []), start=1):
        round_stats = round_data.get("round_stats", {})
        teams_data = round_data.get("teams", [])
        if isinstance(teams_data, dict):
            teams_data = list(teams_data.values())

        teams = []
        for team_data in teams_data:
            team_id = team_data.get("team_id") or team_data.get("faction_id")
            team_name = faction_names.get(
                team_id, team_data.get("team_name", "未知队伍")
            )
            players = []
            for player in team_data.get("players", []):
                player_id = player.get("player_id") or player.get("playerId")
                profile = player_profiles.get(player_id, {})
                avatar = (
                    player.get("avatar")
                    or player.get("avatar_url")
                    or profile.get("avatar")
                    or profile.get("avatar_url")
                )
                saved_player = {
                    "nickname": player.get("nickname", "未知选手"),
                    "playerId": player_id,
                    "stats": player.get("player_stats", {}),
                }
                if avatar:
                    try:
                        saved_player["avatar"] = download_avatar(
                            avatar, player_id or saved_player["nickname"]
                        )
                    except (RuntimeError, ValueError) as error:
                        print(
                            f"⚠️ 选手 {saved_player['nickname']} 头像快照保存失败：{error}"
                        )
                players.append(saved_player)
            teams.append({"name": team_name, "players": players})

        raw_score = round_stats.get("Score", "")
        map_name = (
            round_stats.get("Map")
            or round_data.get("map")
            or round_data.get("round_name")
            or f"地图 {index}"
        )
        winner_id = round_stats.get("Winner")
        winner = faction_names.get(winner_id, "")
        if not winner and winner_id:
            winner = next(
                (team["name"] for team in teams if team["name"] == winner_id), ""
            )

        maps.append(
            {
                "name": map_name,
                "score": str(raw_score).replace("/", "-").strip(),
                "winner": winner,
                "teamA": teams[0]["name"] if teams else "",
                "teamB": teams[1]["name"] if len(teams) > 1 else "",
                "teams": teams,
            }
        )
    return maps


def extract_match_id(url_or_id):
    """从 FACEIT 房间链接中提取纯净的 Match ID"""
    match = re.search(r"room/([a-zA-Z0-9-]+)", url_or_id)
    if match:
        return match.group(1)
    return url_or_id.strip()


def fetch_faceit_match(match_id):
    """调用 FACEIT OpenAPI 抓取比赛数据和统计结果"""
    api_key = os.environ.get(FACEIT_API_KEY_ENV)
    if not api_key:
        raise RuntimeError(
            f"未设置 {FACEIT_API_KEY_ENV} 环境变量。"
            "请先配置 FACEIT API Key，再运行同步脚本。"
        )

    headers = {"Authorization": "Bearer " + api_key}
    base_url = f"https://open.faceit.com/data/v4/matches/{match_id}"
    stats_url = f"https://open.faceit.com/data/v4/matches/{match_id}/stats"

    print(f"\n⏳ 正在向 FACEIT 请求比赛数据 (Match ID: {match_id})...")

    try:
        response = requests.get(base_url, headers=headers, timeout=20)
    except requests.exceptions.RequestException as error:
        raise RuntimeError(f"FACEIT 比赛信息请求失败：{error}") from error
    if response.status_code != 200:
        print(f"❌ 获取基础信息失败！HTTP 状态码: {response.status_code}")
        return None

    data = response.json()
    try:
        faction1 = data["teams"]["faction1"]
        faction2 = data["teams"]["faction2"]
        factions = [faction1, faction2]
        team_a = faction1["name"]
        team_b = faction2["name"]

        voting = data.get("voting", {})
        map_name = "未知地图"
        if voting and "map" in voting and "pick" in voting["map"]:
            map_name = voting["map"]["pick"][0]

        try:
            stats_resp = requests.get(stats_url, headers=headers, timeout=20)
        except requests.exceptions.RequestException as error:
            raise RuntimeError(f"FACEIT 比赛统计请求失败：{error}") from error
        score = "未出结果"
        winner = "待定"
        details = {"teams": [], "maps": []}

        if stats_resp.status_code == 200:
            stats_data = stats_resp.json()
            details["maps"] = parse_player_stats(stats_data, factions)
            if details["maps"]:
                details["teams"] = details["maps"][0]["teams"]
                map_wins = {team_a: 0, team_b: 0}
                for map_data in details["maps"]:
                    if map_data["winner"] in map_wins:
                        map_wins[map_data["winner"]] += 1
                if len(details["maps"]) > 1:
                    score = f"{map_wins[team_a]} : {map_wins[team_b]}"
                    winner = max(map_wins, key=map_wins.get)
                else:
                    score = details["maps"][0]["score"] or score
                    winner = details["maps"][0]["winner"] or "无法解析胜者"
        else:
            print("⚠️ 警告：统计数据尚未生成，如果比赛刚刚结束，请等待几分钟后重试。")

        print("✅ 抓取成功！\n")
        return {
            "id": match_id,
            "faceitUrl": f"https://www.faceit.com/en/cs2/room/{match_id}",
            "stage": "新比赛 (需手动修改阶段名称)",
            "info": f"地图: {map_name}",
            "teamA": team_a,
            "teamB": team_b,
            "score": score,
            "winner": winner,
            "details": details,
            "maps": details["maps"],
            "format": "BO3" if len(details["maps"]) > 1 else "BO1",
        }
    except Exception as error:
        print(f"❌ 解析比赛数据时发生错误: {error}")
        return None


def combine_bo3_matches(matches):
    """将逐张地图的 FACEIT 比赛合并为一个 BO3 系列赛记录。"""
    if not matches:
        raise ValueError("BO3 至少需要一场 FACEIT 地图比赛。")

    first = matches[0]
    team_a, team_b = first["teamA"], first["teamB"]
    maps = []
    map_wins = {team_a: 0, team_b: 0}

    for match in matches:
        match_maps = match.get("maps") or match.get("details", {}).get("maps", [])
        if not match_maps:
            info = match.get("info", "")
            map_name = re.sub(r"^地图:\s*", "", info) or "未知地图"
            match_maps = [{
                "name": map_name,
                "score": match.get("score", ""),
                "winner": match.get("winner", ""),
                "teams": match.get("details", {}).get("teams", []),
            }]
        for map_data in match_maps:
            saved_map = dict(map_data)
            saved_map["faceitMatchId"] = match["id"]
            saved_map["teamA"] = match["teamA"]
            saved_map["teamB"] = match["teamB"]
            maps.append(saved_map)
            if saved_map.get("winner") in map_wins:
                map_wins[saved_map["winner"]] += 1

    if len(maps) > 3:
        raise ValueError("BO3 数据最多只能包含三张地图。")

    winner = max(map_wins, key=map_wins.get)
    return {
        "id": "bo3-" + "-".join(match["id"] for match in matches),
        "faceitUrl": first.get("faceitUrl"),
        "faceitUrls": [match.get("faceitUrl") for match in matches if match.get("faceitUrl")],
        "stage": "新比赛 (需手动修改阶段名称)",
        "format": "BO3",
        "info": " / ".join(
            f"{map_data.get('name', '未知地图')} ({map_data.get('score', '比分待定')})"
            for map_data in maps
        ),
        "teamA": team_a,
        "teamB": team_b,
        "score": f"{map_wins[team_a]} : {map_wins[team_b]}",
        "winner": winner if map_wins[winner] else "待定",
        "maps": maps,
        "details": {"teams": [], "maps": maps},
    }


def main():
    print("========================================")
    print("🏆 Aussie Laozi Cup 战绩半自动同步工具")
    print("========================================")

    if not os.environ.get(FACEIT_API_KEY_ENV):
        print(
            f"❌ 未设置 {FACEIT_API_KEY_ENV} 环境变量。"
            "请先配置 FACEIT API Key！"
        )
        return

    match_type = input(
        "\n请选择录入方式：1=单个 FACEIT 链接（自动识别 BO1/BO3），"
        "3=多个地图链接手动合并为 BO3 [1/3]\n> "
    ).strip()
    if match_type == "3":
        raw_ids = input(
            "请按比赛顺序粘贴 FACEIT 地图链接或 Match ID，"
            "多个用逗号分隔（BO3 可为 2 或 3 张图）：\n> "
        )
        match_ids = [extract_match_id(value.strip()) for value in raw_ids.split(",") if value.strip()]
        if not 2 <= len(match_ids) <= 3:
            print("❌ BO3 需要输入 2 或 3 个地图 Match ID。")
            return
        map_matches = []
        for map_id in match_ids:
            map_match = fetch_faceit_match(map_id)
            if not map_match:
                print("❌ 地图数据获取失败，已取消合并。")
                return
            map_matches.append(map_match)
        match_data = combine_bo3_matches(map_matches)
    else:
        user_input = input("\n请粘贴 FACEIT 比赛链接 或 直接输入 Match ID：\n> ")
        match_id = extract_match_id(user_input)
        match_data = fetch_faceit_match(match_id)
        if not match_data:
            return

    print("-" * 40)
    print("获取到的比赛数据如下：")
    print(f"对阵: {match_data['teamA']} VS {match_data['teamB']}")
    print(f"地图: {match_data['info']}")
    print(f"比分: {match_data['score']}")
    print(f"胜者: {match_data['winner']}")
    print("-" * 40)

    confirm = input("数据是否准确？(y/N, 输入 n 可以丢弃并手动修正): ").strip().lower()

    if confirm == "y":
        stage = input(
            "请输入这是哪场比赛 (例如 '半决赛 (BO1)' 或 'S4常规赛'): "
        ).strip()
        if stage:
            match_data["stage"] = stage
        if match_data.get("format") == "BO1" and input(
            "赛制是否为 BO3？(y/N): "
        ).strip().lower() == "y":
            match_data["format"] = "BO3"

        data_store = {"tournamentTitle": "CS2 社区娱乐赛", "series": []}
        if os.path.exists(JSON_FILE):
            with open(JSON_FILE, "r", encoding="utf-8") as file:
                try:
                    data_store = json.load(file)
                except json.JSONDecodeError:
                    raise ValueError(f"比赛数据文件不是有效 JSON：{JSON_FILE}")

        if not isinstance(data_store.get("series"), list):
            legacy_matches = data_store.pop("matches", [])
            data_store["series"] = [{
                "id": "s1",
                "title": "Aussie Laozi Cup S1",
                "status": "completed",
                "description": "Aussie Laozi Cup 首届比赛记录。",
                "matches": legacy_matches,
            }]

        if not data_store["series"]:
            print("❌ 当前没有系列赛，请先运行 `python -m tools.manage_matches` 创建一届赛事。")
            return

        print("\n所属系列赛：")
        for index, series in enumerate(data_store["series"], start=1):
            print(f"{index}. {series.get('title', series.get('id', '未命名'))}")
        selection = input("请选择系列赛编号：").strip()
        if not selection.isdigit() or not 1 <= int(selection) <= len(data_store["series"]):
            print("❌ 系列赛编号无效，未保存比赛。")
            return

        selected_series = data_store["series"][int(selection) - 1]
        if any(
            existing.get("id") == match_data.get("id")
            for series in data_store["series"]
            for existing in series.get("matches", [])
        ):
            print("❌ 该 FACEIT Match ID 已存在，未保存重复记录。")
            return
        selected_series.setdefault("matches", []).insert(0, match_data)
        if selected_series.get("status") == "upcoming":
            selected_series["status"] = "active"

        with open(JSON_FILE, "w", encoding="utf-8") as file:
            json.dump(data_store, file, ensure_ascii=False, indent=2)
            
        print(
            f"\n🎉 已将 {match_data['teamA']} VS {match_data['teamB']} "
            f"添加到 {selected_series.get('title', '系列赛')}，写入 {JSON_FILE}。"
        )
        print("现在你可以执行 `git add .` -> `git commit` -> `git push` 发布最新战绩了！")
    else:
        print("已取消保存，如果因为重赛导致 API 数据错误，建议直接手动修改 matches.json。")


if __name__ == "__main__":
    main()
