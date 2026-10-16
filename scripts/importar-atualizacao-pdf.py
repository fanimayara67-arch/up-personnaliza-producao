"""Importa os três produtos autorizados; a medalha é excluída por orientação do proprietário."""
import hashlib
import json
import stat
import zipfile
from datetime import datetime, timezone
from pathlib import Path, PurePosixPath
from PIL import Image

root=Path(__file__).resolve().parents[1]
archive=Path('C:/Users/orlan/Downloads/UP-Personaliza-Atualizacao-PDF.zip')
work=root/'work/up-personaliza-atualizacao-pdf'
work.mkdir(parents=True,exist_ok=True)
with zipfile.ZipFile(archive) as bundle:
    entries=bundle.infolist()
    if sum(entry.file_size for entry in entries)>100*1024*1024:
        raise ValueError('Arquivo descompactado excede o limite.')
    for entry in entries:
        name=PurePosixPath(entry.filename.replace('\\','/'))
        target=(work/str(name)).resolve()
        if name.is_absolute() or '..' in name.parts or ':' in str(name) or not target.is_relative_to(work.resolve()) or stat.S_ISLNK(entry.external_attr>>16):
            raise ValueError('Caminho inseguro no ZIP.')
        if entry.is_dir():target.mkdir(parents=True,exist_ok=True)
        else:
            target.parent.mkdir(parents=True,exist_ok=True)
            target.write_bytes(bundle.read(entry))
source=work/'UP-Personaliza-Atualizacao-PDF'
data=json.loads((source/'catalogo-para-pdf.json').read_text(encoding='utf-8-sig'))
verification=json.loads((source/'integracao/VERIFICACAO.json').read_text(encoding='utf-8-sig'))
costs=json.loads((source/'uso-interno/custos-internos.json').read_text(encoding='utf-8-sig'))
catalog_file=root/'catalog/personalizados.json'
catalog=json.loads(catalog_file.read_text(encoding='utf-8'))
mapping={
 'UP-MP-001':('marcador-pagina-personalizado','up-marcadores-pagina','Marcadores de página','Lembranças e presentes','Com nome',
              'Um marcador de página para presentear com um nome especial. A imagem ilustra o modelo dourado com recorte de coração e tassel; medidas, acabamento e produção serão confirmados no orçamento.'),
 'UP-MX-001':('mexedor-drink-com-nome','up-mexedores','Mexedores personalizados','Festas e eventos','Com nome recortado',
              'Um nome para acompanhar a identidade do seu evento. A imagem ilustra um mexedor azul com nome recortado no topo; tamanho, material, acabamento e condições de uso serão confirmados no orçamento.'),
 'UP-MT-001':('marcador-taca-formato-taca','up-marcadores-taca','Marcadores de taça','Festas e eventos','Formato taça',
              'Um marcador para identificar a taça com uma inicial. A imagem ilustra o acessório dourado em formato de taça com corrente de bolinhas. O produto é o marcador e não inclui uma taça de vidro; medidas e produção serão confirmadas.'),
}
private_costs={}
for item in data['produtos']:
    if item['id'] not in mapping:continue
    model_id,family_id,family_name,intent,label,description=mapping[item['id']]
    verification_item=next(row for row in verification['imagens'] if row['id']==item['id'])
    original=source/item['fotos']['png']
    if hashlib.sha256(original.read_bytes()).hexdigest()!=verification_item['png_sha256']:raise ValueError('Imagem não confere com manifesto.')
    image=Image.open(original).convert('RGB')
    if image.size!=(1254,1254):raise ValueError('Resolução diferente da informada.')
    images=[]
    for size in (400,800,1200):
        name=f'{model_id}-{size}.webp'
        image.resize((size,size),Image.Resampling.LANCZOS).save(root/'public/assets/catalogo-personalizados'/name,'WEBP',quality=88,method=6)
        images.append({'src':'/assets/catalogo-personalizados/'+name,'width':size,'height':size})
    bulk=item['preco_por_quantidade']
    if bulk['operador_quantidade']!='>' or bulk['quantidade_referencia']!=10 or bulk['quantidade_minima_inteira']!=11:raise ValueError('Condição de quantidade inesperada.')
    model={
      'id':model_id,'familyId':family_id,'sku':item['id'],'label':label,'title':item['nome'].replace('–','-').replace('�','-'),'description':description,
      'alt':item['descricao_visual'],'images':images,'imageKind':'ai_generated_product_concept','productionStatus':'prototype_to_validate',
      'stock':{'quantity':None,'verifiedAt':None,'source':None},
      'specifications':{'material':None,'dimensionsMm':None,'productionDays':None,'piecesPerKit':None},
      'cost':{key:None for key in ['unitCents','setupCents','fixedFeeCents','paymentFeeBps','taxBps','targetContributionBps']},
      'pricingResearch':{'asOf':'2026-10-15','confidence':'owner_supplied','retailTargetCents':item['preco_unitario_centavos'],
          'bulkTargets':[{'minimumQuantity':11,'unitTargetCents':bulk['preco_unitario_centavos']}],
          'status':'owner_provided_reference','basis':'Preços informados na atualização; acima de 10 unidades significa 11 ou mais do mesmo modelo.'},
      'providedPricing':{'retailCents':item['preco_unitario_centavos'],'bulkMinimumQuantity':11,'bulkUnitCents':bulk['preco_unitario_centavos'],
          'bulkCondition':'Acima de 10 unidades','mixedModelsAllowed':False,'sourceDate':'2026-10-15'},
      'approvedOffers':[],
    }
    existing=next((row for row in catalog['models'] if row['id']==model_id or row['sku']==item['id']),None)
    if existing:
        if existing['id']!=model_id:raise ValueError('SKU já usado por outro modelo.')
        # Preserve administration already performed after an earlier import.
        for key in ['stock','specifications','cost','productionStatus','productionNote','pricingPlan']:
            if key in existing:model[key]=existing[key]
        catalog['models'][catalog['models'].index(existing)]=model
    else:catalog['models'].append(model)
    group=next((row for row in catalog['groups'] if row['id']==family_id),None)
    if group is None:
        group={'id':family_id,'name':family_name,'intent':intent,'modelIds':[],'cover':images[-1]['src'],'unit':'unit'}
        catalog['groups'].append(group)
    if model_id not in group['modelIds']:group['modelIds'].append(model_id)
    cost=next(row for row in costs['produtos'] if row['id']==item['id'])
    private_costs[item['id']]={'reportedUnitCents':cost['custo_unitario_informado_centavos'],'compositionConfirmed':False,'source':'UP-Personaliza-Atualizacao-PDF.zip','asOf':'2026-10-15'}
catalog['updatedAt']=datetime.now(timezone.utc).isoformat()
catalog_file.write_text(json.dumps(catalog,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'catalog/private-reported-costs.json').write_text(json.dumps(private_costs,ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
(root/'catalog/excluded-products.json').write_text(json.dumps([{'sourceId':'UP-MD-001','name':'Medalha personalizada em acrílico com gravação','reason':'Retirada solicitada pelo proprietário; não importar no site nem no PDF.'}],ensure_ascii=False,indent=2)+'\n',encoding='utf-8')
print(json.dumps({'imported':list(mapping),'excluded':['UP-MD-001'],'activeModels':len(catalog['models']),'families':len(catalog['groups']),'discountStartsAt':11,'privateCostsPublished':False},ensure_ascii=False))
