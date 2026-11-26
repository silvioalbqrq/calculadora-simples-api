# motor-simples-api

API local do **motor oficial do Simples Nacional** (Receita Federal,
[`calculadora-rtc-simples-nacional`](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional),
v1.0.2, base V0073), usada pela calculadora
[silvioalbqrq/calculadora-simples](https://github.com/silvioalbqrq/calculadora-simples).

O site é estático (GitHub Pages). O cálculo de IBS/CBS roda aqui, num JDK 25.
Este repo guarda só o *launcher* e o Dockerfile. O `api-simples-nacional.jar` e a
base SQLite são gerados das fontes oficiais (repos `ReceitaFederal`), não são
versionados aqui.

## Local (Windows)

```
calculadora-service\.env   # copie de calculadora-service\.env.example
```

`.env`:

```
ORIGENS_PERMITIDAS=http://localhost:8081,http://127.0.0.1:8081
JAVA_EXE=..\.ferramentas\jdk-25.0.5.1+2\bin\java.exe
PORT=8083
```

`node launcher.mjs` — o motor sobe em `http://localhost:8083/api` e o front em
`8081` o encontra:

```
http://localhost:8081/?api=http://localhost:8083/api
```

(Se o `java` não estiver no `PATH`, passe `JAVA_EXE` no `.env` com o caminho do
`java.exe` do JDK 25.)

## Docker / host

```
docker build -t calculadora-simples-api .
docker run -p 10000:10000 -e ORIGENS_PERMITIDAS=https://silvioalbqrq.github.io calculadora-simples-api
```

- `ORIGENS_PERMITIDAS` — lista separada por vírgula (CORS do motor).
  Padrão: `http://localhost:8081,http://127.0.0.1:8081`.
- `PORT` — porta HTTP (padrão 10000).
- `JAVA_EXE` — caminho do `java` dentro do container (já definido na imagem).
- `ACORDAR_URL` — opcional; GET de minuto em minuto para o host grátis não dormir
  e para acordar o Supabase.
- `METRICAS_PORT` — opcional; porta do actuator (padrão: a mesma do serviço).

Atenção ao caminho da base: o SQLite **não abre** caminho com espaço
(`Default Project`). O launcher aponta o datasource para o caminho real e, por
isso, funciona aqui e no container.

## Sobre o jar e a base

O `api-simples-nacional.jar` (~85 MB RELEASE) e a base `calculadora-pro.db`
(~5,5 MB) estão versionados, por baixo do limite de 100 MB do GitHub e sem
depender de download em build. Eles vêm do motor oficial da Receita Federal,
sob licença MIT. Ao atualizar o motor, troque os dois arquivos e faça novo
commit (o Render reconstrói a imagem).
