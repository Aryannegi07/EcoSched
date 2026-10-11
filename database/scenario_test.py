#!/usr/bin/env python3
"""
EcoSched end-to-end SCENARIO test (MySQL + real C scheduler, no Spring Boot).

Scenario from the Phase-1 test plan:
  3 users, 5 e-waste items, 5 pickup requests, 2 collection teams
  R1 priority 3, R2 priority 5, R3 priority 2, R4 priority 4, R5 priority 5
  (R5 was requested EARLIER than R2, so R5 must win the priority-5 tie)

It uses the same statement sequence as SchedulerService (see workflow_test.py):
lock teams -> lock open requests -> C program decides -> apply ASSIGN lines -> COMMIT.

Usage: python3 database/scenario_test.py --user root --password PW
Needs: pip install pymysql ; built scheduler (cd scheduler && make) ; MySQL running.
It RE-CREATES the ecosched database from schema.sql (no seed data).
"""
import argparse, calendar, os, subprocess, sys
from datetime import datetime, timedelta

try:
    import pymysql
except ImportError:
    sys.exit("pymysql missing:  pip install pymysql")

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
SCHED = os.path.join(ROOT, "scheduler", "ecosched_scheduler")
OPEN = ("PENDING", "ASSIGNED", "IN_PROGRESS")

ap = argparse.ArgumentParser()
ap.add_argument("--host", default="127.0.0.1"); ap.add_argument("--port", type=int, default=3306)
ap.add_argument("--user", default="root");      ap.add_argument("--password", default="")
args = ap.parse_args()

def connect(db="ecosched"):
    return pymysql.connect(host=args.host, port=args.port, user=args.user, password=args.password,
                           database=db, autocommit=False)

def reset_db():
    env = dict(os.environ)
    if args.password:
        env["MYSQL_PWD"] = args.password          # keeps the password off the command line
    cli = ["mysql", f"-h{args.host}", f"-P{args.port}", f"-u{args.user}"]
    with open(os.path.join(ROOT, "database", "schema.sql")) as fh:
        subprocess.run(cli, stdin=fh, check=True, env=env)

def c_scheduler(command, stdin_text, arg=None):
    cmd = [SCHED, command] + ([str(arg)] if arg is not None else [])
    p = subprocess.run(cmd, input=stdin_text, capture_output=True, text=True, timeout=10)
    return p.returncode, [l.strip() for l in p.stdout.splitlines() if l.strip()]

def build_input(teams, reqs):
    lines = [f"TEAM {t[0]} {t[1]}" for t in teams]
    for rid, prio, when, status, team in reqs:
        lines.append(f"REQUEST {rid} {prio} {calendar.timegm(when.timetuple())} {status} {team if team else '-'}")
    return "\n".join(lines) + "\n"

def lock_state(cur):
    cur.execute("SELECT team_id, status, current_task FROM collection_teams ORDER BY team_id FOR UPDATE")
    teams = cur.fetchall()
    cur.execute("SELECT request_id, priority, request_time, status, team_id FROM pickup_requests "
                "WHERE status IN %s ORDER BY request_id FOR UPDATE", (OPEN,))
    return teams, cur.fetchall()

def run(conn):
    cur = conn.cursor()
    try:
        teams, reqs = lock_state(cur)
        rc, out = c_scheduler("run", build_input(teams, reqs))
        assert rc == 0, out
        done = []
        for line in out:
            f = line.split()
            if f[0] == "ASSIGN":
                rid, tid = int(f[1]), int(f[2])
                cur.execute("UPDATE pickup_requests SET team_id=%s, status='ASSIGNED' WHERE request_id=%s", (tid, rid))
                cur.execute("UPDATE collection_teams SET status='BUSY', current_task=%s WHERE team_id=%s", (rid, tid))
                done.append((rid, tid))
        conn.commit()
        return done, out
    except Exception:
        conn.rollback(); raise

def complete(conn, rid):
    cur = conn.cursor()
    try:
        teams, reqs = lock_state(cur)
        rc, out = c_scheduler("complete", build_input(teams, reqs), arg=rid)
        if rc != 0:
            conn.rollback(); return rc, out
        tid = int(next(l for l in out if l.startswith("COMPLETED")).split()[2])
        cur.execute("UPDATE collection_teams SET status='AVAILABLE', current_task=NULL WHERE team_id=%s", (tid,))
        cur.execute("UPDATE pickup_requests SET status='COMPLETED' WHERE request_id=%s", (rid,))
        conn.commit(); return 0, out
    except Exception:
        conn.rollback(); raise

PASS = FAIL = 0
def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else:    FAIL += 1; print(f"  FAIL  {name}   {detail}")

def one(conn, sql, params=()):
    cur = conn.cursor(); cur.execute(sql, params); r = cur.fetchone(); conn.commit(); return r[0] if r else None

def rows(conn, sql, params=()):
    cur = conn.cursor(); cur.execute(sql, params); r = cur.fetchall(); conn.commit(); return r

def must_fail(conn, name, sql, params=(), expect=None):
    """Statement must be refused by MySQL; prints the real error text."""
    cur = conn.cursor()
    try:
        cur.execute(sql, params); conn.rollback()
        check(name, False, "statement was accepted")
    except pymysql.MySQLError as e:
        conn.rollback()
        ok = expect is None or e.args[0] == expect
        check(f"{name}  [{e.args[0]}: {str(e.args[1])[:70]}]", ok, f"expected error {expect}")

# =============================================================================================
reset_db()
conn = connect()
cur = conn.cursor()
base = datetime(2026, 10, 9, 9, 0, 0)

print("== 0. setup: 3 users, 5 items, 2 teams, 5 requests ==")
for n, e, p in (("Asha Rao", "asha@example.com", "9876500001"),
                ("Ravi Kumar", "ravi@example.com", "9876500002"),
                ("Meena Joshi", "meena@example.com", "9876500003")):
    cur.execute("INSERT INTO users(full_name,email,phone,address) VALUES(%s,%s,%s,'Dehradun')", (n, e, p))
items = [(1, "Dell Laptop", "LAPTOP", 2.5), (1, "Old Phone", "MOBILE", 0.3), (2, "CRT Monitor", "TV_MONITOR", 9.0),
         (3, "Battery Pack", "BATTERY", 1.2), (3, "Tablet", "TABLET", 0.6)]
for u, n, c, w in items:
    cur.execute("INSERT INTO e_waste(user_id,item_name,category,weight_kg) VALUES(%s,%s,%s,%s)", (u, n, c, w))
cur.execute("INSERT INTO collection_teams(team_name,contact_phone) VALUES('Team Alpha','9000000001'),('Team Beta','9000000002')")
# R1..R5 : (user, item, priority, minutes after base). R5 (minute 1) is EARLIER than R2 (minute 5).
reqdef = [(1, 1, 3, 10), (1, 2, 5, 5), (2, 3, 2, 20), (3, 4, 4, 30), (3, 5, 5, 1)]
for u, i, p, m in reqdef:
    cur.execute("INSERT INTO pickup_requests(user_id,item_id,location,priority,request_time) VALUES(%s,%s,'Dehradun',%s,%s)",
                (u, i, p, base + timedelta(minutes=m)))
conn.commit()
check("3 users", one(conn, "SELECT COUNT(*) FROM users") == 3)
check("5 e-waste items", one(conn, "SELECT COUNT(*) FROM e_waste") == 5)
check("5 pickup requests, all PENDING", one(conn, "SELECT COUNT(*) FROM pickup_requests WHERE status='PENDING'") == 5)
check("2 teams, both AVAILABLE", one(conn, "SELECT COUNT(*) FROM collection_teams WHERE status='AVAILABLE'") == 2)
print("   priorities R1..R5 =", [r[0] for r in rows(conn, "SELECT priority FROM pickup_requests ORDER BY request_id")])

print("== 1. first scheduler run: 2 teams, 5 requests ==")
done, out = run(conn)
print("   C output:", out)
check("exactly 2 assignments", len(done) == 2, done)
check("R5 (priority 5, EARLIER request_time) assigned FIRST", done and done[0][0] == 5, done)
check("R2 (priority 5, later request_time) assigned SECOND", len(done) > 1 and done[1][0] == 2, done)
check("R1/R3/R4 still PENDING (3 pending)", one(conn, "SELECT COUNT(*) FROM pickup_requests WHERE status='PENDING'") == 3)
check("both assigned requests are ASSIGNED with a team", one(conn, "SELECT COUNT(*) FROM pickup_requests WHERE status='ASSIGNED' AND team_id IS NOT NULL") == 2)
check("both teams BUSY", one(conn, "SELECT COUNT(*) FROM collection_teams WHERE status='BUSY'") == 2)
check("current_task of the teams = {R5, R2}", {r[0] for r in rows(conn, "SELECT current_task FROM collection_teams")} == {5, 2})
check("v_integrity_violations empty", one(conn, "SELECT COUNT(*) FROM v_integrity_violations") == 0)

print("== 2. ALL TEAMS BUSY: run again ==")
done2, out2 = run(conn)
print("   C output:", out2)
check("no new assignment", done2 == [], done2)
check("still 2 active, 3 pending", rows(conn, "SELECT status, COUNT(*) FROM pickup_requests GROUP BY status ORDER BY status") ==
      (("ASSIGNED", 2), ("PENDING", 3)))
check("no team has two active requests",
      one(conn, "SELECT COUNT(*) FROM (SELECT team_id FROM pickup_requests WHERE status IN ('ASSIGNED','IN_PROGRESS') GROUP BY team_id HAVING COUNT(*)>1) x") == 0)

print("== 3. complete R5 -> team free -> run again ==")
rc, o = complete(conn, 5)
check("complete R5 accepted by C scheduler", rc == 0, o)
check("R5 COMPLETED", one(conn, "SELECT status FROM pickup_requests WHERE request_id=5") == "COMPLETED")
t5 = one(conn, "SELECT team_id FROM pickup_requests WHERE request_id=5")
check("its team AVAILABLE and current_task cleared", rows(conn, "SELECT status, current_task FROM collection_teams WHERE team_id=%s", (t5,)) == (("AVAILABLE", None),))
check("R5 keeps team_id as history", t5 is not None)
done3, out3 = run(conn)
check("next assignment is R4 (priority 4, highest remaining)", done3 == [(4, t5)], done3)
check("R1 and R3 still PENDING", rows(conn, "SELECT request_id FROM pickup_requests WHERE status='PENDING' ORDER BY request_id") == ((1,), (3,)))

print("== 4. complete R2 -> run -> R1 (priority 3) before R3 (priority 2) ==")
complete(conn, 2); done4, _ = run(conn)
check("R1 (priority 3) assigned", [d[0] for d in done4] == [1], done4)
complete(conn, 4); done5, _ = run(conn)
check("R3 (priority 2) assigned last", [d[0] for d in done5] == [3], done5)
check("0 pending left", one(conn, "SELECT COUNT(*) FROM pickup_requests WHERE status='PENDING'") == 0)
for r in (1, 3):
    complete(conn, r)
check("all 5 COMPLETED, all teams AVAILABLE, integrity OK",
      one(conn, "SELECT COUNT(*) FROM pickup_requests WHERE status='COMPLETED'") == 5 and
      one(conn, "SELECT COUNT(*) FROM collection_teams WHERE status='AVAILABLE'") == 2 and
      one(conn, "SELECT COUNT(*) FROM v_integrity_violations") == 0)

print("== 5. SAME PRIORITY: earlier request_time first (3 teams free, 2 requests, 1 team to spare check) ==")
cur.execute("DELETE FROM pickup_requests"); cur.execute("DELETE FROM collection_teams WHERE team_id=2"); conn.commit()
# one team left (Team Alpha). Two requests priority 7: item 1 later, item 2 earlier
cur.execute("INSERT INTO pickup_requests(user_id,item_id,location,priority,request_time) VALUES(1,1,'X',7,%s)", (base + timedelta(minutes=50),))
cur.execute("INSERT INTO pickup_requests(user_id,item_id,location,priority,request_time) VALUES(1,2,'X',7,%s)", (base + timedelta(minutes=40),))
conn.commit()
ids = [r[0] for r in rows(conn, "SELECT request_id FROM pickup_requests ORDER BY request_time")]
d, _ = run(conn)
check("one team, two equal-priority requests: the EARLIER request_time wins", [x[0] for x in d] == [ids[0]], (d, ids))

print("== 6. INVALID DATA (database layer; Java validation messages need Spring and are NOT covered here) ==")
must_fail(conn, "missing user (FK) on request", "INSERT INTO pickup_requests(user_id,item_id,location,priority) VALUES(999,1,'X',3)", expect=1452)
must_fail(conn, "missing user (FK) on e-waste", "INSERT INTO e_waste(user_id,item_name,category,weight_kg) VALUES(999,'x','LAPTOP',1)", expect=1452)
must_fail(conn, "invalid e-waste item id (composite FK)", "INSERT INTO pickup_requests(user_id,item_id,location,priority) VALUES(1,999,'X',3)", expect=1452)
must_fail(conn, "item owned by another user (composite FK)", "INSERT INTO pickup_requests(user_id,item_id,location,priority) VALUES(2,1,'X',3)", expect=1452)
must_fail(conn, "invalid e-waste category", "INSERT INTO e_waste(user_id,item_name,category,weight_kg) VALUES(1,'x','TOASTER',1)", expect=3819)
must_fail(conn, "invalid weight 0", "INSERT INTO e_waste(user_id,item_name,category,weight_kg) VALUES(1,'x','LAPTOP',0)", expect=3819)
must_fail(conn, "priority 11", "INSERT INTO pickup_requests(user_id,item_id,location,priority) VALUES(1,1,'X',11)", expect=3819)
must_fail(conn, "priority 0", "INSERT INTO pickup_requests(user_id,item_id,location,priority) VALUES(1,1,'X',0)", expect=3819)
must_fail(conn, "PENDING request that already has a team (CHECK)", "INSERT INTO pickup_requests(user_id,item_id,team_id,location,priority) VALUES(1,1,1,'X',3)", expect=3819)
must_fail(conn, "invalid team id on request (FK)", "INSERT INTO pickup_requests(user_id,item_id,team_id,location,priority,status) VALUES(1,1,999,'X',3,'ASSIGNED')", expect=1452)
must_fail(conn, "invalid team status", "INSERT INTO collection_teams(team_name,contact_phone,status) VALUES('T','9000000009','SLEEPING')", expect=3819)
must_fail(conn, "BUSY team without a task", "INSERT INTO collection_teams(team_name,contact_phone,status) VALUES('T','9000000009','BUSY')", expect=3819)
must_fail(conn, "duplicate email", "INSERT INTO users(full_name,email,phone,address) VALUES('d','asha@example.com','9876500009','x')", expect=1062)
must_fail(conn, "bad phone", "INSERT INTO users(full_name,email,phone,address) VALUES('d','d@example.com','12','x')", expect=3819)

# duplicate assignment: same team on two active requests / same request on two teams
cur.execute("UPDATE collection_teams SET status='AVAILABLE', current_task=NULL"); cur.execute("DELETE FROM pickup_requests"); conn.commit()
cur.execute("INSERT INTO collection_teams(team_name,contact_phone) VALUES('Team Beta','9000000002')")
for it, m in ((1, 1), (2, 2)):
    cur.execute("INSERT INTO pickup_requests(user_id,item_id,location,priority,request_time) VALUES(1,%s,'X',5,%s)", (it, base + timedelta(minutes=m)))
conn.commit()
rid_a, rid_b = [r[0] for r in rows(conn, "SELECT request_id FROM pickup_requests ORDER BY request_id")]
tid_a, tid_b = [r[0] for r in rows(conn, "SELECT team_id FROM collection_teams ORDER BY team_id")]
cur.execute("UPDATE pickup_requests SET team_id=%s, status='ASSIGNED' WHERE request_id=%s", (tid_a, rid_a))
cur.execute("UPDATE collection_teams SET status='BUSY', current_task=%s WHERE team_id=%s", (rid_a, tid_a)); conn.commit()
must_fail(conn, "duplicate assignment: team already has an active request", "UPDATE pickup_requests SET team_id=%s, status='ASSIGNED' WHERE request_id=%s", (tid_a, rid_b), expect=1062)
must_fail(conn, "duplicate assignment: same request as current_task of a 2nd team", "UPDATE collection_teams SET status='BUSY', current_task=%s WHERE team_id=%s", (rid_a, tid_b))
# C scheduler layer
rc, o = c_scheduler("complete", "TEAM 1 BUSY\nREQUEST 1 5 1000 ASSIGNED 1\n", arg=99)
check(f"C scheduler: complete unknown request -> non-zero exit  [rc={rc}: {' '.join(o)[:60]}]", rc != 0)
rc, o = c_scheduler("run", "TEAM 1 BUSY\nREQUEST 1 5 1000 ASSIGNED 1\nREQUEST 2 5 1001 ASSIGNED 1\n")
check(f"C scheduler: input where one team holds two active requests -> refused  [rc={rc}]", rc != 0)

print("== 7. DATABASE: PK / FK / constraints / JOIN / transaction / indexes / CRUD ==")
tbls = rows(conn, "SELECT TABLE_NAME FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='ecosched' AND CONSTRAINT_TYPE='PRIMARY KEY' ORDER BY 1")
check("PK on all 4 tables", [t[0] for t in tbls] == ["collection_teams", "e_waste", "pickup_requests", "users"], tbls)
fks = one(conn, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='ecosched' AND CONSTRAINT_TYPE='FOREIGN KEY'")
check(f"foreign keys present ({fks})", fks >= 5)
chk = one(conn, "SELECT COUNT(*) FROM information_schema.TABLE_CONSTRAINTS WHERE TABLE_SCHEMA='ecosched' AND CONSTRAINT_TYPE='CHECK'")
check(f"CHECK constraints present ({chk})", chk >= 10)
idx = one(conn, "SELECT COUNT(DISTINCT INDEX_NAME) FROM information_schema.STATISTICS WHERE TABLE_SCHEMA='ecosched' AND INDEX_NAME<>'PRIMARY'")
check(f"secondary/unique indexes present ({idx})", idx >= 8)
j = rows(conn, "SELECT u.full_name, e.item_name, r.priority, r.status, t.team_name FROM pickup_requests r "
               "JOIN users u ON u.user_id=r.user_id JOIN e_waste e ON e.item_id=r.item_id "
               "LEFT JOIN collection_teams t ON t.team_id=r.team_id ORDER BY r.request_id")
check(f"4-table JOIN returns {len(j)} rows with team names", len(j) == 2 and j[0][4] == "Team Alpha", j)
ex = rows(conn, "EXPLAIN SELECT request_id FROM pickup_requests WHERE status='PENDING' ORDER BY priority DESC, request_time ASC")
check("EXPLAIN uses idx_requests_status_priority_time", any("idx_requests_status_priority_time" in str(r) for r in ex), ex)
# CRUD
cur.execute("INSERT INTO users(full_name,email,phone,address) VALUES('Crud User','crud@example.com','9876500077','Delhi')"); uid = cur.lastrowid; conn.commit()
cur.execute("UPDATE users SET address='Mumbai' WHERE user_id=%s", (uid,)); conn.commit()
check("CRUD create + update", one(conn, "SELECT address FROM users WHERE user_id=%s", (uid,)) == "Mumbai")
cur.execute("DELETE FROM users WHERE user_id=%s", (uid,)); conn.commit()
check("CRUD delete", one(conn, "SELECT COUNT(*) FROM users WHERE user_id=%s", (uid,)) == 0)
must_fail(conn, "delete a user who owns requests is refused (ON DELETE RESTRICT)", "DELETE FROM users WHERE user_id=1", expect=1451)
# transaction rollback
try:
    cur.execute("UPDATE pickup_requests SET team_id=%s, status='ASSIGNED' WHERE request_id=%s", (tid_b, rid_b))
    cur.execute("UPDATE collection_teams SET status='BUSY', current_task=%s WHERE team_id=%s", (rid_a, tid_b))   # violates UNIQUE
    conn.commit(); check("transaction rollback", False, "second UPDATE should have failed")
except pymysql.MySQLError:
    conn.rollback()
    check("transaction: failed 2nd step + ROLLBACK also undid the 1st step",
          rows(conn, "SELECT status, team_id FROM pickup_requests WHERE request_id=%s", (rid_b,)) == (("PENDING", None),))
check("v_integrity_violations empty at the end", one(conn, "SELECT COUNT(*) FROM v_integrity_violations") == 0)

print(f"\nRESULT: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
