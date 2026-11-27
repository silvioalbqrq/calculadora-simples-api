# motor-simples-api

API do **motor oficial do Simples Nacional** (Receita Federal,
[`calculadora-rtc-simples-nacional`](https://github.com/ReceitaFederal/calculadora-rtc-simples-nacional),
v1.0.2, base V0073), usada pela calculadora
[silvioalbqrq/calculadora-simples](https://github.com/silvioalbqrq/calculadora-simples)
publicada em <https://silvioalbqrq.github.io/calculadora-simples/>.

O site é estático (GitHub Pages), servido num domínio; o motor é um jar Java
(Spring Boot) servido aqui, no Render. As duas partes conversam por HTTP, então
**tudo o que importa é a base URL do motor e o CORS** liberando o domínio do site.

Este repo guarda o *launcher* e o Dockerfile. O `api-simples-nacional.jar`
(~85 MB) e a base SQLite `calculadora-pro.db` são gerados das fontes oficiais
(repos `ReceitaFederal`, MIT) e estão versionados junto:

```
motor-simples/target/api-simples-nacional.jar
motor-simples/calculadora/db/calculadora-pro.db
```

## Rotas que o site usa

Todas abaixo de `/api` (o mesmo prefixo do Swagger em `/api/swagger-ui.html`):

| Método | Caminho | O que faz |
| --- | --- | --- |
| `GET`  | `/api/versao` | Versão do motor e da base (`versaoApp`, `versaoDb`, `descricaoVersaoDb`). |
| `GET`  | `/api/calculadora/simples-nacional/atividades?data=AAAA-MM-DD` | Catálogo de `cAtivSN` (`codigo`, `descricao`, `disponivel`, `tpDocsAdmissiveis`, `sujeitaFatorR`, `anexoSemFatorR`). |
| `POST` | `/api/calculadora/observabilidade/simples-nacional` | Cálculo de IBS/CBS por item do Simples (`objetos[]` com `tribCalc.vIBSSN`, `vCBSSN`, … e `total.vIBSSNtot`, `vCBSSNtot`). |

`POST` recebe o corpo do RTC (`id`, `versao`, `data`, `tpDoc`, `CRT`, `itens[]` com
`cAtivSN`, `cClassTrib`, `ncm`, `baseCalculo`, `valorImpostoSeletivo`, `pIBSSN`,
`pCBSSN`). `GET /api/versao` é também o **health check** do serviço.

> ⚠️ O motor oficial **não é publicado** em `reforma.genesisinnovation.io`
> (que serve o regime regular): lá essas rotas são `404 "rota fora da API
> pública"`. O front nunca deve apontar para o host de outro regime.

## Configurar no Render

O `render.yaml` deste repo já descreve o serviço; o caminho mais rápido é
**New → Blueprint** apontando para ele. Se preferir criar à mão:

1. **Web Service** apontando para este repo, branch `main`, **Runtime: Docker**
   (Dockerfile na raiz). Plano free serve.
2. Variáveis de ambiente (`Environment`):
   - `ORIGENS_PERMITIDAS` = `https://silvioalbqrq.github.io` — o CORS do motor.
     Várias origens separadas por vírgula, sem espaço.
   - `JAVA_EXE` = `/opt/java/openjdk/bin/java` (o Dockerfile já define).
   - `SPRING_PROFILES_ACTIVE` = `offline` (o Dockerfile já define).
   - **Não defina `ACORDAR_URL`**: ela só serve para pingar um host externo a
     cada minuto; no Render é ruído.
   - `PORT` é injetada pelo Render — não fixe.
3. **Health Check Path**: `/api/versao`.
4. Deixe o **auto-deploy** ligado: cada push em `main` reconstrói a imagem.

### Por que o serviço pode ficar em `502 no-deploy`

`no-deploy` significa que o Render não tem nenhum deploy concluído com sucesso —
não é o site nem o CORS. As causas comuns, em ordem:

1. **Base SQLite não encontrada.** O app abre `./calculadora/db/...` relativo ao
   diretório do jar, mas a base fica em `motor-simples/calculadora/db/`. Sem o
   `SPRING_DATASOURCE_URL` apontando para o arquivo real, o boot morre no
   datasource. O `launcher.mjs` já faz isso; deploys anteriores a esse ajuste
   falhavam exatamente aqui.
2. O build falhou (log em **Logs → Build**). O `Dockerfile` copia o jar de
   85 MB e a base SQLite; ambos precisam estar no commit.
3. O container subiu mas não abriu a porta a tempo (log **Logs → Runtime**:
   `port scan timeout`). O boot do Spring com SQLite leva dezenas de segundos;
   `-Xmx320m` + `TieredStopAtLevel=1` no launcher deixam folga no plano free.
4. O serviço está com **Runtime: Static Site** ou sem start command. Use Docker.

Enquanto o serviço não tiver um deploy verde, o site não tem o que chamar e
mostra "motor indisponível" — isso é o comportamento correto do front.

### Verificar (passo a passo)

```powershell
$B = "https://calculadora-simples-api-1.onrender.com/api"
curl.exe -i "$B/versao"                                   # 200 + JSON, CORS presente
curl.exe -i "$B/calculadora/simples-nacional/atividades?data=2027-01-01"
curl.exe -i -X OPTIONS "$B/calculadora/observabilidade/simples-nacional" `
  -H "Origin: https://silvioalbqrq.github.io" `
  -H "Access-Control-Request-Method: POST" `
  -H "Access-Control-Request-Headers: content-type"       # 200/204 + ACAO
```

Se `curl` mostrar os cabeçalhos `access-control-allow-origin: https://silvioalbqrq.github.io`
e o site continuar "offline", o problema é no **front** (base URL ou tipo de
erro exibido), não no Render.

## Docker (render.yaml)

```
docker build -t calculadora-simples-api .
docker run -p 10000:10000 -e ORIGENS_PERMITIDAS=https://silvioalbqrq.github.io calculadora-simples-api
```

- `ORIGENS_PERMITIDAS` — lista separada por vírgula (CORS do motor).
  Padrão: `http://localhost:8081,http://127.0.0.1:8081`.
- `PORT` — porta HTTP (padrão 10000).
- `JAVA_EXE` — caminho do `java` dentro do container (já definido na imagem).
- `ACORDAR_URL` — **deixe vazio no Render** (só para manter acordado o host
  local); ver acima.
- `METRICAS_PORT` — opcional; porta do actuator (padrão: a mesma do serviço).

O launcher aponta o datasource (`SPRING_DATASOURCE_URL`) para o caminho real da
base, porque o default do app é relativo ao diretório do jar — onde a base não
está. É isso que faz o motor subir tanto aqui (caminho com espaço) quanto no
container.

## Atualizar o motor

Troque os dois arquivos (`api-simples-nacional.jar` e `calculadora-pro.db`) e
faça novo commit — o Render reconstrói a imagem. Eu avanço um major na tag
quando trocar o motor; o site lê a versão em `/api/versao` na inicialização e
exibe o selo `motor <versãoApp> · base <versaoDb>`.
