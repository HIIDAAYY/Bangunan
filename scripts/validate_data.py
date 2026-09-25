"""Validasi data/catalog.json dan data/sample_orders.json."""
import json
import sys
from pathlib import Path

DATA = Path(__file__).resolve().parent.parent / "data"
KATEGORI = {
    "Semen", "Pasir/Batu", "Besi Beton", "Bata/Hebel", "Kayu/Triplek", "Cat",
    "Pipa & Fitting", "Keramik", "Baja Ringan", "Paku/Baut", "Alat",
}
KESULITAN = {"mudah", "sedang", "sulit"}

errors = []
catalog = json.loads((DATA / "catalog.json").read_text(encoding="utf-8"))
orders = json.loads((DATA / "sample_orders.json").read_text(encoding="utf-8"))

if len(catalog) != 50:
    errors.append(f"catalog: harus 50 produk, ada {len(catalog)}")

skus = {}
alias_owner = {}
for p in catalog:
    sku = p.get("sku")
    if sku in skus:
        errors.append(f"catalog: SKU duplikat {sku}")
    skus[sku] = p
    for field in ("nama", "kategori", "satuan", "harga", "alias"):
        if field not in p:
            errors.append(f"catalog {sku}: field '{field}' tidak ada")
    if p.get("kategori") not in KATEGORI:
        errors.append(f"catalog {sku}: kategori tidak dikenal '{p.get('kategori')}'")
    if not isinstance(p.get("harga"), int) or p["harga"] <= 0:
        errors.append(f"catalog {sku}: harga tidak valid {p.get('harga')}")
    if not p.get("alias"):
        errors.append(f"catalog {sku}: alias kosong")
    for a in p.get("alias", []):
        key = a.strip().lower()
        if key in alias_owner and alias_owner[key] != sku:
            errors.append(f"catalog: alias '{a}' dipakai {alias_owner[key]} dan {sku}")
        alias_owner[key] = sku

missing_kategori = KATEGORI - {p.get("kategori") for p in catalog}
if missing_kategori:
    errors.append(f"catalog: kategori tanpa produk {sorted(missing_kategori)}")

if len(orders) != 30:
    errors.append(f"sample_orders: harus 30 contoh, ada {len(orders)}")

ids = [o.get("id") for o in orders]
if len(set(ids)) != len(ids):
    errors.append("sample_orders: id duplikat")

n_items = n_ambigu = 0
for o in orders:
    oid = o.get("id")
    if not o.get("pesan"):
        errors.append(f"order {oid}: pesan kosong")
    if o.get("tingkat_kesulitan") not in KESULITAN:
        errors.append(f"order {oid}: tingkat_kesulitan tidak valid")
    if "catatan_pengiriman" not in o:
        errors.append(f"order {oid}: field catatan_pengiriman tidak ada")
    if not o.get("expected"):
        errors.append(f"order {oid}: expected kosong")
    for e in o.get("expected", []):
        if e.get("ambigu") is True:
            n_ambigu += 1
            if not e.get("teks"):
                errors.append(f"order {oid}: item ambigu tanpa teks")
        elif "sku" in e:
            n_items += 1
            if e["sku"] not in skus:
                errors.append(f"order {oid}: SKU '{e['sku']}' tidak ada di catalog.json")
            qty = e.get("qty")
            if not isinstance(qty, (int, float)) or qty <= 0:
                errors.append(f"order {oid}: qty tidak valid untuk {e['sku']}: {qty}")
        else:
            errors.append(f"order {oid}: item expected tidak dikenali {e}")

if errors:
    print(f"GAGAL: {len(errors)} masalah")
    for err in errors:
        print(" -", err)
    sys.exit(1)

by_level = {k: sum(o["tingkat_kesulitan"] == k for o in orders) for k in sorted(KESULITAN)}
print(f"OK: {len(catalog)} produk, {len(KATEGORI)} kategori, {len(alias_owner)} alias unik")
print(f"OK: {len(orders)} contoh pesanan, {n_items} item ber-SKU (semua ada di katalog), {n_ambigu} item ambigu")
print(f"    tingkat kesulitan: {by_level}")
