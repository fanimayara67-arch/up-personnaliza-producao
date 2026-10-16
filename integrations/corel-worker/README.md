# Conector Windows UP

Instalação e operação: [production/README.md](../../production/README.md).

`worker.py`: HTTPS, credencial revogável, exclusividade, concessão, journal e progresso. `svg_io.py`: unidades e contornos SVG. `engine.py`: nesting e validação GEOS, SVG/DXF. `corel.py`: COM e ponte local documentada. `capture.py`: captura restrita à janela autorizada. `config.example.json`: exemplo sem segredos. `requirements.lock.txt`: dependências exatas verificadas em Python 3.12/Windows.

`python worker.py --diagnose` funciona sem Corel. `--once` executa no máximo uma tarefa real. `--live` exige Corel conectado e autorização local. `config.local.json` e `state/` são privados e ignorados pelo Git.

`python check_corel.py` verifica COM e grava/reabre CDR/PDF reais a partir do exemplo técnico, com conferência de contornos e escala. Use somente com a instância de produção vazia e o conector sem tarefa ativa. A versão 27.2.0.135 foi testada neste Windows; eCut permanece sem perfil validado.
