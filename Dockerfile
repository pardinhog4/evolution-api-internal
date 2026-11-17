# Servidor de WhatsApp não oficial (Evolution API, Baileys), multiempresa.
# A versão fica fixa aqui: para atualizar, troque a tag e faça um deploy.
FROM evoapicloud/evolution-api:v2.3.7

# Configuração que não é segredo e vale para todas as empresas.
# Segredos e endereços (chave global, banco, Redis, URL pública) entram pelas variáveis do Railway.
ENV SERVER_TYPE=http \
    SERVER_PORT=8080 \
    LANGUAGE=pt-BR \
    LOG_LEVEL=ERROR,WARN,INFO \
    # Banco: a sessão de cada número fica no Postgres, então um deploy não pede QR de novo.
    DATABASE_PROVIDER=postgresql \
    DATABASE_CONNECTION_CLIENT_NAME=evolution_multiempresa \
    DATABASE_SAVE_DATA_INSTANCE=true \
    DATABASE_SAVE_DATA_NEW_MESSAGE=true \
    DATABASE_SAVE_MESSAGE_UPDATE=true \
    DATABASE_SAVE_DATA_CONTACTS=false \
    DATABASE_SAVE_DATA_CHATS=false \
    DATABASE_SAVE_DATA_LABELS=false \
    DATABASE_SAVE_DATA_HISTORIC=false \
    # Cache no Redis (não na memória do processo).
    CACHE_REDIS_ENABLED=true \
    CACHE_REDIS_PREFIX_KEY=evolution \
    CACHE_REDIS_SAVE_INSTANCES=false \
    CACHE_LOCAL_ENABLED=false \
    # Multiempresa: cada instância tem a própria chave e o próprio webhook.
    # Nada de webhook global (misturaria as empresas) nem de apagar instância parada.
    WEBHOOK_GLOBAL_ENABLED=false \
    DEL_INSTANCE=false \
    AUTHENTICATION_EXPOSE_IN_FETCH_INSTANCES=true \
    # Nome neutro que aparece em "Aparelhos conectados" no celular.
    CONFIG_SESSION_PHONE_CLIENT=Atendimento \
    CONFIG_SESSION_PHONE_NAME=Chrome \
    QRCODE_LIMIT=30

EXPOSE 8080
