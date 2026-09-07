# Atlas Community Edition project config (ADR 0019).
# Apply: atlas migrate apply --env local
# Hash:  atlas migrate hash

env "local" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://db/migrations"
  }
}

env "ci" {
  url = getenv("DATABASE_URL")
  migration {
    dir = "file://db/migrations"
  }
}
