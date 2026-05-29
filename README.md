# Banco A - Proyecto CQRS

#Katherin Juliana Moreno Carvajal & Mariana Salas Gutierrez

Sistema académico para demostrar una arquitectura CQRS con:

- Escrituras en PostgreSQL.
- Lecturas en MongoDB.
- Sincronización asíncrona mediante patrón Outbox.
- Gap de consistencia eventual visible.
- Kong como API Gateway.
- UI en React.

## Arquitectura

```txt
UI React
   |
   v
Kong API Gateway
   |
   |--- /api/commands/transfers  ---> Write Service ---> PostgreSQL
   |
   |--- /api/queries/transfers   ---> Read Service  ---> MongoDB

Sync Worker:
PostgreSQL Outbox ---> espera 30 segundos ---> MongoDB
```

## Cómo ejecutar

Desde la carpeta raíz del proyecto:

```bash
docker compose up --build
```

Luego abre:

```txt
http://localhost:5173
```

## Puertos

| Componente | Puerto |
|---|---|
| Frontend React | 5173 |
| Kong Proxy | 8000 |
| Kong Admin | 8001 |
| Write Service | 3001 |
| Read Service | 3002 |
| PostgreSQL | 5432 |
| MongoDB | 27017 |

## Flujo de demostración

1. Crear una transferencia desde la UI.
2. Consultar SQL: la transferencia debe aparecer inmediatamente.
3. Consultar NoSQL inmediatamente: la transferencia todavía puede no aparecer.
4. Esperar aproximadamente 30 segundos.
5. Consultar NoSQL otra vez: la transferencia ya debe aparecer.

## Endpoints vía Kong

Crear transferencia:

```bash
curl -X POST http://localhost:8000/api/commands/transfers \
  -H "Content-Type: application/json" \
  -d "{\"sourceAccount\":\"CTA-001\",\"destinationAccount\":\"CTA-002\",\"amount\":150000,\"currency\":\"COP\"}"
```

Consultar por cuenta en NoSQL:

```bash
curl "http://localhost:8000/api/queries/transfers?account=CTA-001"
```

Consultar una transferencia específica en NoSQL:

```bash
curl http://localhost:8000/api/queries/transfers/ID_DE_LA_TRANSFERENCIA
```

Consultar una transferencia específica en SQL:

```bash
curl http://localhost:8000/api/commands/debug/sql/transfers/ID_DE_LA_TRANSFERENCIA
```

## Ajustar el gap de sincronización

En `docker-compose.yml`, cambia esta variable del `sync-worker`:

```yaml
SYNC_DELAY_SECONDS: 30
```

Para la sustentación se recomienda dejarlo entre 25 y 45 segundos. Así se puede ver que al inicio MongoDB no está sincronizado, pero luego sí.

## Comandos

Ver logs del worker:

```bash
docker logs -f banco_sync_worker
```

Ver logs del Write Service:

```bash
docker logs -f banco_write_service
```

Ver logs del Read Service:

```bash
docker logs -f banco_read_service
```

Entrar a PostgreSQL:

```bash
docker exec -it banco_postgres psql -U admin -d banco_a
```

Consultar SQL:

```sql
SELECT * FROM transfers;
SELECT * FROM outbox_events ORDER BY created_at DESC;
```

Entrar a MongoDB:

```bash
docker exec -it banco_mongo mongosh
```

Consultar MongoDB:

```js
use banco_a_read
db.transfers.find().pretty()
```

## Explicación técnica

El sistema usa CQRS porque separa los comandos de escritura y las consultas de lectura. Las transferencias se registran en PostgreSQL para garantizar ACID. Las consultas se hacen desde MongoDB para tener un modelo de lectura optimizado. La sincronización se realiza de forma asíncrona usando una tabla `outbox_events` y un `sync-worker`. Por eso, justo después de crear una transferencia, esta existe en SQL pero aún no necesariamente aparece en MongoDB. Después del delay configurado, el worker actualiza MongoDB y se observa la consistencia eventual.
