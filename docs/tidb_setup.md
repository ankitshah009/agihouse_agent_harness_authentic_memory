# TiDB Cloud setup (hackathon path)

Goal: get the Aubric AML demo running with AML_BACKEND=tidb end-to-end in <10 minutes.

## 1. Provision a Serverless cluster
- Go to https://tidbcloud.com, sign in, create a free Serverless cluster.
- Region: pick the closest to the demo venue.
- Name: `aubric-aml-demo`.
- Root user + generated password. Save the password.

## 2. Get the connection string
- Click "Connect" → "MySQL CLI" tab.
- The host looks like: gateway01.us-west-2.prod.aws.tidbcloud.com.
- Port: 4000.
- Build the DSN:
  `mysql://USER.root:PASSWORD@HOST:4000/aubric_aml`
  (Serverless uses the `USER.root` prefix — don't skip the dot.)

## 3. Allowlist the demo machine
- In TiDB Cloud → Security → Traffic Filter → Add Current IP. For demo wifi, consider 0.0.0.0/0 temporarily (remove after hackathon).

## 4. Apply the schema
```
mysql -h HOST -P 4000 -u USER.root -p --ssl-mode=VERIFY_IDENTITY \
  --ssl-ca=/etc/ssl/cert.pem < schema/ddl/aml_tidb_schema.sql
```
If you get "Unknown column type VECTOR" — your cluster is pre-8.5. Recreate a cluster on the latest serverless tier.

## 5. Run the demo
```
export AML_BACKEND=tidb
export DATABASE_URL='mysql://USER.root:PASSWORD@HOST:4000/aubric_aml'
pnpm demo
```

Expected: header badge shows `TiDB Cloud · HNSW`. Killer-SQL panel pulses sub-100ms. Update cycle writes branch_runs row visible in TiDB Cloud SQL editor.

## 6. Smoke-check from the CLI
```
python scripts/run_demo.py
```

Should print KILLER_QUERY and a promote/archive recommendation without error.

## Troubleshooting
- `mysql.connector.errors.InterfaceError: 2003` — IP not allowlisted.
- `Access denied` — user format wrong (missing `.root` prefix on Serverless).
- `VECTOR INDEX not supported` — cluster too old; use a new Serverless cluster.
- Vector inserts fail — SQLite stores embeddings as JSON text; TiDB stores as VECTOR. The Python layer handles both but you must recreate the schema if you changed backends mid-run.
