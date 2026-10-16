"""Extract the supplied product bundle into this workspace, rejecting unsafe paths."""
from pathlib import Path
import json
import zipfile

project = Path(__file__).resolve().parent.parent
archive = Path(r'C:\Users\orlan\Downloads\UP-Personaliza-Site-Cracha-ao-Navio.zip')
destination = (project / 'work' / 'cracha-navio-2026-10-16').resolve()
if not destination.is_relative_to(project / 'work'):
    raise RuntimeError('Destination outside workspace support directory')
with zipfile.ZipFile(archive) as bundle:
    entries = bundle.infolist()
    if len(entries) > 500 or sum(entry.file_size for entry in entries) > 250_000_000:
        raise RuntimeError('Unexpected package size')
    targets = []
    for entry in entries:
        target = (destination / entry.filename.replace('\\', '/')).resolve()
        if not target.is_relative_to(destination) or (entry.external_attr >> 16) & 0o170000 == 0o120000:
            raise RuntimeError('Unsafe archive entry')
        targets.append((entry, target))
    for entry, target in targets:
        if entry.is_dir():
            target.mkdir(parents=True, exist_ok=True)
        else:
            target.parent.mkdir(parents=True, exist_ok=True)
            target.write_bytes(bundle.read(entry))
source = destination / 'UP-Personaliza-Site-Cracha-ao-Navio'
data = json.loads((source / 'integracao/catalogo-rodada2.json').read_text(encoding='utf-8'))
print(json.dumps({'files':len(entries),'products':[
    {'id':row['id'],'name':row['name'],'category':row['categorySlug'],
     'variants':[{'id':v['id'],'label':v['label'],'configuration':v.get('configuration',{})} for v in row['variants']],
     'fields':row['configurationFields']} for row in data['products']
]}, ensure_ascii=False, indent=2))
