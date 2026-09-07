
## Migration numbering pitfall
Parallel feature branches must not reuse the next migration number (e.g. two
different `002_*` files). The runner skips any file whose number is <= the
DB's current user_version, so a DB that already ran a dropped/renumbered
migration silently misses the replacement (symptom: columns like
`tasks.cadence` missing at runtime, client crash on `CADENCE_BADGE[undefined]`).
If it happens on a throwaway dev/container DB: back it up, delete `data/app.db`
(+ -shm/-wal) or the compose volume, restart so migrations apply in order.
Greenfield data is disposable (see 002 header comment).
