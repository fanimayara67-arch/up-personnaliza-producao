"""Import the inspected archive data; leave stock, costs and sellable prices unconfirmed."""
import hashlib
import json
import shutil
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent
SOURCE = ROOT / 'work/catalogo-completo-2026-10-15/UP-Personaliza-novos-produtos'
pilot = json.loads((SOURCE / 'integracao/catalogo-piloto.json').read_text(encoding='utf-8'))
destination = ROOT / 'catalog/personalizados.json'
if destination.exists():
    raise SystemExit('Catalog already exists. Use catalog-admin to preserve stock and cost data.')

# Prices below are research hypotheses, never checkout offers or public prices.
copy = {
    'chaveiro-casamento': ('Chaveiro de acrílico personalizado para casamento', 'Uma lembrança com as iniciais ou a mensagem do casal. Conte sua ideia para avaliarmos o modelo, o acabamento e a quantidade para o evento.', 'Conceito de chaveiro transparente com iniciais, detalhe de coração e argola dourada.', 1490, [(10,690),(50,490),(100,420)], 'medium'),
    'porta-bombom-natal': ('Porta-bombom de Natal em formato de árvore', 'Uma proposta para apresentar pequenos presentes nas confraternizações de Natal. Informe a quantidade e se deseja incluir o bombom no orçamento; composição, encaixe e produção serão confirmados.', 'Conceito de árvore verde com espaço para um bombom embalado.', 1290, [(10,990),(50,790),(100,690)], 'low'),
    'chaveiro-mensagem': ('Chaveiro personalizado com mensagem', 'Uma palavra, um agradecimento ou uma pequena mensagem para acompanhar o dia a dia. Envie o texto desejado e a quantidade para consultar o formato e a personalização.', 'Conceito de chaveiro retangular dourado com a palavra Gratidão e recorte de coração.', 1290, [(10,590),(50,430),(100,370)], 'medium'),
    'jogo-da-velha-acrilico': ('Jogo da velha decorativo em acrílico', 'Um projeto que aproxima jogo e decoração de mesa. Consulte as dimensões, as peças e a possibilidade de personalização antes de definir o seu conjunto.', 'Conceito de tabuleiro transparente com peças de jogo da velha e compartimentos laterais.', 16990, [(5,14990),(10,13990),(25,12990)], 'medium'),
    'bandeja-espelhada': ('Bandeja decorativa com detalhes dourados', 'Uma proposta de bandeja para destacar pequenos objetos e compor a decoração. Informe as medidas e o acabamento desejados para avaliarmos a produção do modelo.', 'Conceito de bandeja transparente com estrutura geométrica dourada.', 24990, [(5,21990),(10,19990),(25,18990)], 'low'),
    'mexedor-frutas': ('Mexedor de drink com tema de frutas', 'Modelos de frutas para combinar com a identidade da festa. Consulte a quantidade, o comprimento e as possibilidades de cor; material e uso com bebidas dependem da validação de produção.', 'Conceito de quatro mexedores coloridos em formatos de frutas.', 890, [(10,590),(50,390),(100,349)], 'medium'),
    'bandeja-renda': ('Bandeja decorativa com desenho de renda', 'Um desenho delicado para organizar objetos e compor presentes. Conte como pretende usar a peça e indique as medidas desejadas para consultarmos o modelo e o acabamento.', 'Conceito de bandeja transparente com desenho branco semelhante a renda.', 21990, [(5,19990),(10,17990),(25,16990)], 'low'),
    'bandeja-personalizada': ('Bandeja personalizada com iniciais ou monograma', 'Uma proposta para levar iniciais, monograma ou nome à decoração. Envie a personalização e as medidas desejadas para consultar o acabamento e a quantidade.', 'Conceito de bandeja transparente com iniciais e desenho de folhas.', 18990, [(5,16990),(10,15990),(25,14990)], 'medium'),
    'bandeja-cafe': ('Bandeja decorativa para cantinho do café', 'Uma peça pensada para compor o cantinho do café e organizar seus objetos. Consulte a frase, as medidas e o acabamento que deseja para o seu ambiente.', 'Conceito de bandeja transparente com a palavra Café e desenhos de xícaras.', 17990, [(5,15990),(10,14990),(25,13990)], 'medium'),
    'mexedor-coracao': ('Mexedor de drink em formato de coração', 'Um modelo de coração para compor os detalhes da festa. Informe a quantidade e a cor desejadas para avaliarmos comprimento, material e produção.', 'Conceito de mexedores com corações em tons de rosa e vermelho.', 690, [(10,490),(50,299),(100,269)], 'medium'),
    'mexedor-casamento': ('Mexedor de drink personalizado com iniciais', 'Iniciais para acompanhar a identidade visual do casamento ou evento. Envie o monograma e a quantidade; as medidas e as condições de uso serão confirmadas no orçamento.', 'Conceito de mexedores com coração e iniciais em acabamentos transparentes e coloridos.', 890, [(10,590),(50,390),(100,349)], 'medium'),
    'kit-mexedores-marcadores': ('Kit de mexedores e marcadores de taça personalizados', 'Uma proposta de conjunto com a mesma identidade para mexedores e marcadores. Informe quantos itens deseja em cada kit e quantos kits precisa; composição, encaixe e acabamento serão confirmados.', 'Conceito de conjunto de mexedores e marcadores de taça com monograma.', None, [], 'low'),
    'chaveiro-fe': ('Chaveiro Fé com coração e cruz', 'Uma proposta de lembrança com a palavra Fé e os símbolos de coração e cruz. Consulte a cor, o tamanho e a quantidade desejada para avaliarmos a produção.', 'Conceito de chaveiro azul com a palavra Fé, cruz e coração vazado.', 1490, [(10,1090),(50,890),(100,790)], 'low'),
}
groups = []
for group in pilot['groups']:
    groups.append({ 'id': group['id'], 'name': group['name'], 'intent': group['intent'], 'modelIds': group['variants'],
                    'cover': group['cover'], 'unit': 'kit' if group['id'] == 'up-kits-eventos' else 'unit' })
models = []
for image in pilot['images']:
    title, description, alt, retail, tiers, confidence = copy[image['id']]
    master = SOURCE / image['master']
    if hashlib.sha256(master.read_bytes()).hexdigest() != image['master_sha256']:
        raise SystemExit(f'Image checksum mismatch: {image["id"]}')
    variants = []
    for variant in image['variants']:
        src = SOURCE / variant['file']
        target = ROOT / variant['file']
        if not src.is_file() or src.stat().st_size != variant['bytes']:
            raise SystemExit(f'Missing/invalid derivative: {src.name}')
        target.parent.mkdir(parents=True, exist_ok=True)
        if target.exists() and hashlib.sha256(target.read_bytes()).digest() != hashlib.sha256(src.read_bytes()).digest():
            raise SystemExit(f'Existing media differs: {target.name}')
        shutil.copy2(src, target)
        variants.append({key:variant[key] for key in ['src','width','height']})
    models.append({ 'id':image['id'], 'familyId':image['family_id'], 'sku':f'UP-PERS-{image["reference"]:02}',
        'label':image['model'], 'title':title, 'description':description, 'alt':alt,
        'images':variants, 'imageKind':'ai_generated_product_concept',
        'productionStatus':'prototype_to_validate', 'stock':{'quantity':None,'verifiedAt':None,'source':None},
        'specifications':{'material':None,'dimensionsMm':None,'productionDays':None,'piecesPerKit':None},
        'cost':{'unitCents':None,'setupCents':None,'fixedFeeCents':None,'paymentFeeBps':None,'taxBps':None,'targetContributionBps':None},
        'pricingResearch':{'asOf':'2026-10-15','confidence':confidence,'retailTargetCents':retail,
            'bulkTargets':[{'minimumQuantity':q,'unitTargetCents':p} for q,p in tiers],
            'status':'proposal_not_approved','basis':'Modelo equivalente a validar; sem frete; não é oferta comercial'},
        'approvedOffers':[] })
document = { 'version':1, 'brand':'UP Personaliza', 'updatedAt':'2026-10-15',
    'collection':'Presentes, lembranças e decoração personalizados', 'groups':groups, 'models':models }
destination.parent.mkdir(parents=True, exist_ok=True)
destination.write_text(json.dumps(document,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'families':len(groups),'models':len(models),'media':sum(len(m['images']) for m in models),
    'confirmedStockRecords':0,'publishedCheckoutOffers':0}))
