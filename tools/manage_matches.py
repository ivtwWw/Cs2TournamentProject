import json
import os
import re
import tempfile

from tools.faceit_sync import (
    JSON_FILE,
    combine_bo3_matches,
    download_avatar,
    extract_match_id,
    fetch_faceit_match,
)


def load_store():
    if not JSON_FILE.exists():
        raise FileNotFoundError(f"找不到比赛数据文件：{JSON_FILE}")

    with JSON_FILE.open("r", encoding="utf-8") as file:
        store = json.load(file)
    if not isinstance(store, dict):
        raise ValueError(f"比赛数据文件格式错误：{JSON_FILE}")
    if not isinstance(store.get("series"), list):
        legacy_matches = store.pop("matches", [])
        store["series"] = [{
            "id": "s1",
            "title": "Aussie Laozi Cup S1",
            "status": "completed",
            "description": "首届 Aussie Laozi Cup。",
            "matches": legacy_matches,
        }]
    if any(not isinstance(item.get("matches"), list) for item in store["series"]):
        raise ValueError(f"系列赛数据格式错误：{JSON_FILE}")
    return store


def save_store(store):
    temporary_path = None
    try:
        with tempfile.NamedTemporaryFile(
            mode="w",
            encoding="utf-8",
            dir=JSON_FILE.parent,
            delete=False,
            suffix=".tmp",
        ) as file:
            json.dump(store, file, ensure_ascii=False, indent=2)
            file.write("\n")
            temporary_path = file.name
        os.replace(temporary_path, JSON_FILE)
    finally:
        if temporary_path and os.path.exists(temporary_path):
            os.remove(temporary_path)


def match_entries(store):
    return [
        (series, match)
        for series in store["series"]
        for match in series["matches"]
    ]


def display_series(store):
    if not store["series"]:
        print("\n目前没有系列赛。")
        return

    print("\n当前系列赛：")
    for index, series in enumerate(store["series"], start=1):
        print(
            f"{index}. {series.get('title', series.get('id', '未命名'))} "
            f"[{series.get('status', 'completed')}] - "
            f"{len(series['matches'])} 场比赛"
        )


def display_matches(store):
    entries = match_entries(store)
    if not entries:
        print("\n目前没有比赛记录。")
        return

    print("\n当前比赛：")
    for index, (series, match) in enumerate(entries, start=1):
        print(
            f"{index}. [{series.get('title', '未命名届次')}] "
            f"{match.get('stage', '未命名赛事')} | "
            f"{match.get('teamA', '未知队伍')} {match.get('score', '-')} "
            f"{match.get('teamB', '未知队伍')} "
            f"({match.get('format', '未标注赛制')})"
        )


def remove_match():
    store = load_store()
    entries = match_entries(store)
    display_matches(store)
    if not entries:
        return

    selection = input("\n输入要删除的比赛编号，输入 0 返回：").strip()
    if selection == "0":
        return
    if not selection.isdigit() or not 1 <= int(selection) <= len(entries):
        print("编号无效，没有删除任何比赛。")
        return

    index = int(selection) - 1
    series, match = entries[index]
    print(
        f"\n即将删除：{series.get('title', '未命名届次')} | "
        f"{match.get('stage', '未命名赛事')} | "
        f"{match.get('teamA', '?')} {match.get('score', '-')} "
        f"{match.get('teamB', '?')}"
    )
    if input("确认删除？此操作会立即修改本地数据文件 (y/N)：").strip().lower() != "y":
        print("已取消，比赛记录未更改。")
        return

    series["matches"].remove(match)
    save_store(store)
    print(f"已删除比赛；更新文件：{JSON_FILE}")


def collect_map_match(match_id):
    match = fetch_faceit_match(extract_match_id(match_id))
    if match is None:
        raise RuntimeError("无法获取这场 FACEIT 比赛。")
    return match


def add_match():
    if not os.environ.get("FACEIT_API_KEY"):
        print("请先设置 FACEIT_API_KEY 环境变量，再录入 FACEIT 比赛。")
        return

    match_type = input(
        "录入方式：1=单个 FACEIT 链接（自动识别 BO1/BO3），"
        "3=多个地图链接手动合并为 BO3："
    ).strip()
    if match_type == "1":
        match_url = input("粘贴 FACEIT 比赛链接或 Match ID：").strip()
        new_match = collect_map_match(match_url)
    elif match_type == "3":
        raw_ids = input(
            "按地图顺序输入 2 或 3 个 FACEIT 链接/Match ID，用逗号分隔："
        )
        ids = [item.strip() for item in raw_ids.split(",") if item.strip()]
        if len(ids) not in (2, 3):
            print("BO3 需要输入 2 或 3 场地图比赛。没有录入数据。")
            return

        map_matches = []
        for match_id in ids:
            try:
                map_matches.append(collect_map_match(match_id))
            except (RuntimeError, ValueError) as error:
                print(f"录入失败：{error} 未写入任何数据。")
                return
        new_match = combine_bo3_matches(map_matches)
    else:
        print("类型无效，没有录入数据。")
        return

    new_match["stage"] = input("请输入赛事阶段/名称：").strip() or "新比赛"
    print(
        f"\n待添加：{new_match['stage']} | {new_match['teamA']} "
        f"{new_match['score']} {new_match['teamB']} "
        f"({new_match.get('format', 'BO1')})"
    )
    if input("确认添加到比赛列表？(y/N)：").strip().lower() != "y":
        print("已取消，比赛记录未更改。")
        return

    store = load_store()
    if not store["series"]:
        print("当前没有系列赛，请先创建系列赛。")
        return
    display_series(store)
    selection = input("选择所属系列赛编号：").strip()
    if not selection.isdigit() or not 1 <= int(selection) <= len(store["series"]):
        print("编号无效，没有添加比赛。")
        return
    selected_series = store["series"][int(selection) - 1]

    existing_ids = {
        match.get("id")
        for series in store["series"]
        for match in series["matches"]
    }
    if new_match.get("id") in existing_ids:
        print("这场比赛已存在（Match ID 重复），未添加。")
        return
    selected_series["matches"].insert(0, new_match)
    if selected_series.get("status") == "upcoming":
        selected_series["status"] = "active"
    save_store(store)
    print(f"已添加到 {selected_series['title']}；更新文件：{JSON_FILE}")


def add_series():
    store = load_store()
    series_id = input("系列赛 ID（例如 s2）：").strip().lower()
    if not series_id or any(item.get("id") == series_id for item in store["series"]):
        print("ID 为空或已存在，没有创建系列赛。")
        return

    title = input("系列赛标题（例如 Aussie Laozi Cup S2）：").strip()
    if not title:
        print("标题不能为空，没有创建系列赛。")
        return
    description = input("系列赛简介（可留空）：").strip()
    status = input("状态：1=即将开始，2=进行中，3=已结束 [1/2/3]：").strip()
    status_values = {"1": "upcoming", "2": "active", "3": "completed"}
    if status not in status_values:
        print("状态无效，没有创建系列赛。")
        return

    store["series"].append({
        "id": series_id,
        "title": title,
        "status": status_values[status],
        "description": description,
        "matches": [],
    })
    save_store(store)
    print(f"已创建 {title}；更新文件：{JSON_FILE}")


def update_series():
    store = load_store()
    display_series(store)
    if not store["series"]:
        return

    selection = input("选择要更新的系列赛编号，输入 0 返回：").strip()
    if selection == "0":
        return
    if not selection.isdigit() or not 1 <= int(selection) <= len(store["series"]):
        print("编号无效，没有更改状态。")
        return

    series = store["series"][int(selection) - 1]
    status = input(
        f"新状态：1=即将开始，2=进行中，3=已结束 "
        f"[当前 {series.get('status', 'completed')}，留空保持不变]："
    ).strip()
    status_values = {"1": "upcoming", "2": "active", "3": "completed"}
    if status and status not in status_values:
        print("状态无效，没有更改状态。")
        return
    if status:
        series["status"] = status_values[status]

    event_time = input(
        f"比赛时间（如 2026年9月1日—9月15日）"
        f"[当前 {series.get('eventTime', '未设置')}，留空保持，输入 - 清除]："
    ).strip()
    if event_time == "-":
        series.pop("eventTime", None)
    elif event_time:
        series["eventTime"] = event_time

    schedule = input(
        "赛程信息（多个阶段可用分号分隔；留空保持，输入 - 清除）"
        f"[当前 {series.get('schedule', '未设置')}]："
    ).strip()
    if schedule == "-":
        series.pop("schedule", None)
    elif schedule:
        series["schedule"] = "\n".join(
            part.strip() for part in schedule.split(";") if part.strip()
        )

    save_store(store)
    print(
        f"已更新 {series['title']}：状态 {series['status']}，"
        f"比赛时间 {series.get('eventTime', '未设置')}。"
    )


def find_champion_players(series):
    final_match = next(
        (
            match for match in series["matches"]
            if re.search(r"总决赛|grand[\s-]*final", match.get("stage", ""), re.I)
        ),
        None,
    )
    champion = series.get("championTeam") or (final_match or {}).get("winner")
    if not champion:
        return champion, []

    maps = (final_match or {}).get("maps") or (final_match or {}).get("details", {}).get("maps", [])
    teams = (
        [team for map_data in maps for team in map_data.get("teams", [])]
        if maps
        else (final_match or {}).get("details", {}).get("teams", [])
    )
    players = {}
    for team in teams:
        if team.get("name") != champion:
            continue
        for player in team.get("players", []):
            key = player.get("playerId") or player.get("nickname")
            if key:
                players.setdefault(key, {
                    "nickname": player.get("nickname", ""),
                    "playerId": player.get("playerId", ""),
                    "avatar": player.get("avatar", ""),
                })
    return champion, list(players.values())


def snapshot_avatar(avatar, player_id):
    if avatar.startswith(("http://", "https://")):
        return download_avatar(avatar, player_id)
    if not avatar:
        return ""
    if re.fullmatch(
        r"assets/images/players/[A-Za-z0-9_-]+\.(?:jpg|png|gif|webp)",
        avatar,
        re.I,
    ):
        return avatar
    raise ValueError(
        "头像必须是 FACEIT CDN HTTPS 图片 URL，或已保存的本地头像路径。"
    )


def edit_series_awards():
    store = load_store()
    display_series(store)
    if not store["series"]:
        return

    selection = input("选择要编辑的届次编号，输入 0 返回：").strip()
    if selection == "0":
        return
    if not selection.isdigit() or not 1 <= int(selection) <= len(store["series"]):
        print("编号无效，没有更改赛事荣誉信息。")
        return

    series = store["series"][int(selection) - 1]
    champion, players = find_champion_players(series)
    current_captain = series.get("captain", {})
    current_mvp = series.get("mvp", {})
    print(f"\n冠军队伍（总决赛胜者）：{champion or '未识别'}")
    print("所有信息留空表示保持现值。")

    entered_champion = input(f"冠军队名 [{series.get('championTeam', champion or '')}]：").strip()
    if entered_champion:
        series["championTeam"] = entered_champion
        champion, players = find_champion_players(series)

    captain = dict(current_captain)
    for key, label in (
        ("nickname", "队长昵称"),
        ("playerId", "队长 FACEIT ID"),
        ("avatar", "队长头像（FACEIT CDN 图片 URL）"),
    ):
        value = input(f"{label} [{captain.get(key, '')}]：").strip()
        if value:
            captain[key] = (
                snapshot_avatar(
                    value, captain.get("playerId") or captain.get("nickname")
                )
                if key == "avatar"
                else value
            )
    if any(captain.values()):
        series["captain"] = captain

    mvp = dict(current_mvp)
    for key, label in (
        ("nickname", "MVP 昵称"),
        ("playerId", "MVP FACEIT ID"),
        ("rating", "赛事总 Rating"),
        ("avatar", "MVP 头像（FACEIT CDN 图片 URL）"),
    ):
        value = input(f"{label} [{mvp.get(key, '')}]：").strip()
        if value:
            mvp[key] = (
                snapshot_avatar(value, mvp.get("playerId") or mvp.get("nickname"))
                if key == "avatar"
                else value
            )
    if any(mvp.values()):
        series["mvp"] = mvp

    if players:
        print("\n冠军队选手头像（输入 FACEIT CDN 图片 URL；留空保留现值）：")
        saved_players = {
            player.get("playerId") or player.get("nickname"): player
            for player in series.get("championPlayers", [])
        }
        for player in players:
            key = player.get("playerId") or player.get("nickname")
            existing = saved_players.get(key, player)
            print(f"- {player['nickname']} | ID: {player['playerId'] or '未记录'}")
            avatar = input(f"  头像图片 URL [{existing.get('avatar', '')}]：").strip()
            saved_avatar = (
                snapshot_avatar(
                    avatar, player.get("playerId") or player.get("nickname")
                )
                if avatar
                else existing.get("avatar", "")
            )
            saved_players[key] = {
                **player,
                "avatar": saved_avatar,
            }
        series["championPlayers"] = list(saved_players.values())

    save_store(store)
    print(f"已更新 {series['title']} 的冠军、队长、MVP 和队员资料。")


def main():
    while True:
        print(
            "\n========== CS2 比赛数据管理 ==========\n"
            "1. 查看系列赛列表\n"
            "2. 拉取并添加新比赛\n"
            "3. 删除比赛\n"
            "4. 创建系列赛（如 S2）\n"
            "5. 更新系列赛信息（状态、比赛时间、赛程）\n"
            "6. 编辑冠军、队长、MVP 和队员资料\n"
            "0. 退出"
        )
        choice = input("请选择：").strip()

        try:
            if choice == "1":
                store = load_store()
                display_series(store)
                display_matches(store)
            elif choice == "2":
                add_match()
            elif choice == "3":
                remove_match()
            elif choice == "4":
                add_series()
            elif choice == "5":
                update_series()
            elif choice == "6":
                edit_series_awards()
            elif choice == "0":
                print("已退出。")
                return
            else:
                print("选项无效，请重新输入。")
        except (OSError, json.JSONDecodeError, RuntimeError, ValueError) as error:
            print(f"操作失败：{error}")


if __name__ == "__main__":
    main()
