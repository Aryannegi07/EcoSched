#!/usr/bin/env python3
"""
EcoSched OS <-> DBMS workflow test (no Spring Boot needed).

This script re-implements SchedulerService step by step in Python, using the SAME
sequence of SQL statements, the SAME lock order and the SAME C scheduler binary:

   BEGIN
   SELECT ... FROM collection_teams  FOR UPDATE            (lock teams)
   SELECT ... FROM pickup_requests WHERE status IN (...) FOR UPDATE   (lock open requests)
   -> send the rows to  scheduler/ecosched_scheduler run   (the C program decides)
   -> for every ASSIGN line:  UPDATE pickup_requests ...; UPDATE collection_teams ...
   COMMIT

It proves that this statement sequence satisfies every constraint/trigger in schema.sql,
that the C output is applied correctly, and that concurrent runs cannot double-assign.
It does NOT test Spring/Hibernate itself - use backend/scripts/*.sh for that.

Usage:  python3 database/workflow_test.py [--user root] [--password ''] [--host 127.0.0.1]
Needs:  pip install pymysql ; a built scheduler (cd scheduler && make) ; MySQL running.
        It RE-CREATES the ecosched database from schema.sql + seed.sql several times.
"""
import argparse, calendar, os, subprocess, sys, threading

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

def connect():
    return pymysql.connect(host=args.host, port=args.port, user=args.user, password=args.password,
                           database="ecosched", autocommit=False)

def reset_db():
    cli = ["mysql", f"-h{args.host}", f"-P{args.port}", f"-u{args.user}"] + ([f"-p{args.password}"] if args.password else [])
    for f, db in (("schema.sql", []), ("seed.sql", ["ecosched"])):
        with open(os.path.join(ROOT, "database", f)) as fh:
            subprocess.run(cli + db, stdin=fh, check=True)

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

# ---- the four operations of SchedulerService ------------------------------------------------
def run(conn):
    cur = conn.cursor()
    try:
        teams, reqs = lock_state(cur)
        rc, out = c_scheduler("run", build_input(teams, reqs))
        assert rc == 0, out
        by_req = {r[0]: r for r in reqs}; by_team = {t[0]: t for t in teams}
        done = []
        for line in out:
            f = line.split()
            if f[0] == "ASSIGN":
                rid, tid = int(f[1]), int(f[2])
                assert by_req[rid][3] == "PENDING" and by_team[tid][1] == "AVAILABLE"
                cur.execute("UPDATE pickup_requests SET team_id=%s, status='ASSIGNED' WHERE request_id=%s", (tid, rid))   # 1+2
                cur.execute("UPDATE collection_teams SET status='BUSY', current_task=%s WHERE team_id=%s", (rid, tid))   # 3+4
                done.append((rid, tid, int(f[3])))
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
        cur.execute("UPDATE collection_teams SET status='AVAILABLE', current_task=NULL WHERE team_id=%s", (tid,))  # team first
        cur.execute("UPDATE pickup_requests SET status='COMPLETED' WHERE request_id=%s", (rid,))
        conn.commit(); return 0, out
    except Exception:
        conn.rollback(); raise

def start(conn, rid):
    cur = conn.cursor(); lock_state(cur)
    cur.execute("UPDATE pickup_requests SET status='IN_PROGRESS' WHERE request_id=%s AND status='ASSIGNED'", (rid,))
    n = cur.rowcount; conn.commit(); return n

def cancel(conn, rid):
    cur = conn.cursor(); lock_state(cur)
    cur.execute("SELECT status FROM pickup_requests WHERE request_id=%s", (rid,)); st = cur.fetchone()[0]
    if st != "PENDING":
        cur.execute("UPDATE collection_teams SET status='AVAILABLE', current_task=NULL WHERE current_task=%s", (rid,))  # release first
    cur.execute("UPDATE pickup_requests SET status='CANCELLED' WHERE request_id=%s", (rid,))
    conn.commit()

# ---- tiny test harness -----------------------------------------------------------------------
PASS = FAIL = 0
def check(name, cond, detail=""):
    global PASS, FAIL
    if cond: PASS += 1; print(f"  PASS  {name}")
    else:    FAIL += 1; print(f"  FAIL  {name}  {detail}")

def q(sql, params=None):
    c = connect(); cur = c.cursor(); cur.execute(sql, params); r = cur.fetchall(); c.close(); return r
def violations(): return q("SELECT COUNT(*) FROM v_integrity_violations")[0][0]
def req(rid): return q("SELECT status, team_id FROM pickup_requests WHERE request_id=%s", (rid,))[0]
def team(tid): return q("SELECT status, current_task FROM collection_teams WHERE team_id=%s", (tid,))[0]

if not os.path.isfile(SCHED): sys.exit("Build the scheduler first:  cd scheduler && make")

print("== 1. one scheduler run on the seed data ==")
reset_db(); conn = connect()
check("seed: queue (C scheduler order) is 1, 3, 8, 2", [r[0] for r in q("SELECT request_id FROM v_pending_priority_queue")] == [1, 3, 8, 2])
done, out = run(conn)
check("two requests assigned (two teams were free)", len(done) == 2, str(done))
check("highest priority (request 1, prio 9, oldest) went first", done and done[0][0] == 1 and done[0][2] == 9, str(done))
check("request 3 (prio 9, newer) second", len(done) == 2 and done[1][0] == 3, str(done))
check("request 1 ASSIGNED to its team", req(1) == ("ASSIGNED", done[0][1]), str(req(1)))
check("that team is BUSY with current_task = 1", team(done[0][1]) == ("BUSY", 1), str(team(done[0][1])))
check("request 3 / its team consistent", req(3)[1] == done[1][1] and team(done[1][1]) == ("BUSY", 3))
check("lower priority requests 8 and 2 still PENDING", req(8)[0] == "PENDING" and req(2)[0] == "PENDING")
check("integrity view empty", violations() == 0)

print("== 2. all teams busy: nothing is assigned, nothing is preempted ==")
done, out = run(conn)
check("second run assigns nothing", done == [], str(out))
check("summary says 2 pending, 0 free teams", any("pending=2" in l and "available_teams=0" in l for l in out), str(out))
check("running work untouched (request 4 still IN_PROGRESS on team 1)", req(4) == ("IN_PROGRESS", 1))

print("== 3. start / complete / re-run ==")
check("start request 1 -> IN_PROGRESS", start(conn, 1) == 1 and req(1)[0] == "IN_PROGRESS")
check("start on a PENDING request changes nothing", start(conn, 8) == 0 and req(8)[0] == "PENDING")
rc, out = complete(conn, 4)
check("complete request 4", rc == 0 and req(4)[0] == "COMPLETED", str(out))
check("team 1 AVAILABLE and current_task NULL", team(1) == ("AVAILABLE", None), str(team(1)))
check("request 4 keeps team_id 1 as history", req(4)[1] == 1)
done, out = run(conn)
check("freed team gets the HIGHEST remaining priority (request 8, prio 7 beats request 2, prio 5)", done == [(8, 1, 7)], str(done))
rc, out = complete(conn, 2)
check("completing a PENDING request is rejected by the C scheduler (exit != 0)", rc != 0, str(out))
check("integrity view empty", violations() == 0)

print("== 4. cancel releases the team in the same transaction ==")
t_of_3 = req(3)[1]
cancel(conn, 3)
check("request 3 CANCELLED", req(3)[0] == "CANCELLED")
check("its team is AVAILABLE again with no task", team(t_of_3) == ("AVAILABLE", None), str(team(t_of_3)))
done, out = run(conn)
check("the released team immediately takes request 2", done == [(2, t_of_3, 5)], str(done))
cancel(conn, 5)   # PENDING? no: request 5 is ASSIGNED to team 2
check("cancelling ASSIGNED request 5 frees team 2", req(5)[0] == "CANCELLED" and team(2) == ("AVAILABLE", None))
check("integrity view empty", violations() == 0)

print("== 5. non-preemptive: an urgent request waits while every team is busy ==")
reset_db(); conn = connect(); run(conn)                       # teams 3,4 busy now, 1,2 busy from seed
c = connect(); cur = c.cursor()
cur.execute("INSERT INTO e_waste (user_id,item_name,category,weight_kg) VALUES (5,'Urgent item','OTHER',1)")
item = cur.lastrowid
cur.execute("INSERT INTO pickup_requests (user_id,item_id,location,priority) VALUES (5,%s,'x',10)", (item,))
urgent = cur.lastrowid; c.commit(); c.close()
done, out = run(conn)
check("priority-10 request stays PENDING, no running job is interrupted", done == [] and req(urgent)[0] == "PENDING")
complete(conn, 4)
done, out = run(conn)
check("as soon as a team frees up, the priority-10 request is chosen first", done and done[0][0] == urgent, str(done))

print("== 6. concurrency: 6 simultaneous scheduler runs, 2 free teams ==")
reset_db()
results, errors = [], []
def worker():
    c = connect()
    try: results.append(run(c)[0])
    except Exception as e: errors.append(repr(e))
    finally: c.close()
ts = [threading.Thread(target=worker) for _ in range(6)]
[t.start() for t in ts]; [t.join() for t in ts]
total = sum(len(r) for r in results)
check("no worker crashed", not errors, str(errors))
check("exactly 2 assignments in total (no request/team assigned twice)", total == 2, f"total={total} results={results}")
check("exactly 2 requests became ASSIGNED", q("SELECT COUNT(*) FROM pickup_requests WHERE status='ASSIGNED'")[0][0] == 2 + 1)  # +1 = seeded request 5
check("all 4 teams BUSY", q("SELECT COUNT(*) FROM collection_teams WHERE status='BUSY'")[0][0] == 4)
check("integrity view empty", violations() == 0)

print(f"\nRESULT: {PASS} passed, {FAIL} failed")
sys.exit(1 if FAIL else 0)
