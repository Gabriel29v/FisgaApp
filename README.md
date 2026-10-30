# Fisga

## Executar localmente

Requer Node.js 18 ou superior. Na raiz do projeto:

```bash
npm start
```

Abra `http://127.0.0.1:3000`. O servidor oferece a página e a API local:

- `GET /api/locations` — localidades disponíveis.
- `GET /api/tides?location=recife&date=2026-10-01` — extremos de maré do dia e dos dias vizinhos, quando disponíveis.

As consultas são encaminhadas à [Tábua de Maré API](https://tabuamare.api.br/docs). A API seleciona o porto oficial mais próximo dentro de Pernambuco; a interface identifica o porto utilizado. A cobertura depende das estações e dos anos publicados pelo provedor.

Os horários/alturas de maré vêm da fonte oficial. O traçado entre os extremos, os horários do sol e a atividade dos peixes são estimativas independentes e estão identificados como tais.

O serviço público limita chamadas anônimas por IP. Consulte os limites e termos atuais na documentação do provedor; o servidor não armazena em cache as respostas.
