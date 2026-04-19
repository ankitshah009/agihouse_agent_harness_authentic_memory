#!/usr/bin/env python3
"""Apply AML schema to TiDB Cloud Serverless (drop-and-recreate)."""
import os, re, sys
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

env_path = ROOT / '.env'
if not env_path.exists():
    sys.exit("No .env file found. Copy .env.example to .env and fill in DATABASE_URL before running this script.")
for line in env_path.read_text().splitlines():
    line = line.strip()
    if line and not line.startswith('#') and '=' in line:
        k, _, v = line.partition('=')
        os.environ.setdefault(k.strip(), v.strip())

try:
    import pymysql
except ImportError:
    sys.exit("pymysql not found — run: ./venv/bin/pip install pymysql")

DATABASE_URL = os.environ.get('DATABASE_URL', '')
if not DATABASE_URL:
    sys.exit("DATABASE_URL is not set. Set it in .env (mysql://user:pass@host:port/db) before running this script.")
m = re.match(r'mysql://([^:]+):([^@]+)@([^:/]+):(\d+)/(.+)', DATABASE_URL)
if not m:
    sys.exit(f"Cannot parse DATABASE_URL: {DATABASE_URL!r}")
creds = dict(user=m[1], password=m[2], host=m[3], port=int(m[4]), db=m[5])


def remove_fk_lines(stmt: str) -> str:
    """Strip entire FK constraint lines, then fix trailing comma before closing )."""
    lines = stmt.splitlines()
    out = [l for l in lines
           if not re.search(r'CONSTRAINT\s+\w+\s+FOREIGN\s+KEY', l, re.IGNORECASE)]

    # Find closing ) and remove trailing comma from the line above it
    closing_idx = next(
        (i for i in range(len(out) - 1, -1, -1) if out[i].strip().startswith(')')),
        None,
    )
    if closing_idx is not None:
        for i in range(closing_idx - 1, -1, -1):
            if out[i].strip():
                out[i] = out[i].rstrip().rstrip(',')
                break

    return '\n'.join(out)


def transform(sql: str) -> str:
    sql = re.sub(
        r'CREATE\s+VIEW\s+IF\s+NOT\s+EXISTS',
        'CREATE OR REPLACE VIEW',
        sql, flags=re.IGNORECASE,
    )
    return sql


schema_sql = (ROOT / 'schema/ddl/aml_tidb_schema.sql').read_text()

stmts = []
for raw in re.split(r';[ \t]*\n|;[ \t]*$', schema_sql):
    s = raw.strip()
    if not s:
        continue
    # Strip leading comment-only lines (but keep the SQL below them)
    s_nocomments = re.sub(r'^(--[^\n]*\n)+', '', s).strip()
    if not s_nocomments:
        continue
    if re.match(r'(CREATE DATABASE|USE\s+)', s_nocomments, re.IGNORECASE):
        continue
    s = s_nocomments
    s = transform(s)
    if re.match(r'CREATE\s+TABLE', s, re.IGNORECASE):
        s = remove_fk_lines(s)
    stmts.append(s)

print(f"Connecting to {creds['host']}:{creds['port']} / {creds['db']} ...")
conn = pymysql.connect(
    host=creds['host'], port=creds['port'],
    user=creds['user'], password=creds['password'],
    database=creds['db'],
    ssl={'ca': '/etc/ssl/cert.pem'},
    autocommit=True,
    connect_timeout=15,
)
cur = conn.cursor()
print("Connected.\n")

# Drop in dependency-safe order
drops = [
    'DROP VIEW IF EXISTS v_authenticity_feature_view',
    'DROP TABLE IF EXISTS audit_events',
    'DROP TABLE IF EXISTS branch_trial_results',
    'DROP TABLE IF EXISTS branch_runs',
    'DROP TABLE IF EXISTS episodic_events',
    'DROP TABLE IF EXISTS authentic_fingerprints',
    'DROP TABLE IF EXISTS active_challenges',
    'DROP TABLE IF EXISTS attack_fingerprints',
    'DROP TABLE IF EXISTS procedural_policies',
    'DROP TABLE IF EXISTS customers',
    'DROP TABLE IF EXISTS tenants',
]
print("=== Dropping existing objects ===")
for d in drops:
    try:
        cur.execute(d)
        print(f"  OK  {d}")
    except Exception as e:
        print(f"  --  {d}  ({e})")

print(f"\n=== Applying {len(stmts)} statements ===")
ok = err = 0
for i, s in enumerate(stmts):
    label = s.split('\n')[0][:72]
    try:
        cur.execute(s)
        print(f"  [{i:02d}] OK   {label}")
        ok += 1
    except Exception as e:
        print(f"  [{i:02d}] ERR  {e}")
        print(f"       >>> {s[:400]}")
        err += 1

conn.close()
print(f"\nResult: {ok} ok, {err} errors.")
sys.exit(0 if err == 0 else 1)
