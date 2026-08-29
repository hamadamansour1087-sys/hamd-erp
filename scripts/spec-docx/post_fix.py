#!/usr/bin/env python3
"""post_fix.py — WPS-compatible page-number post-processing (per toc.md):
1. Remove empty <w:pgNumType/> (docx-js emits it on the cover section).
2. Patch footer PAGE fields with explicit format switches:
   - footer referenced by the Roman section  -> PAGE \\* ROMAN \\* MERGEFORMAT
   - footer referenced by the decimal section -> PAGE \\* arabic \\* MERGEFORMAT
   Footer↔section mapping resolved through document.xml sectPr order + rels.
"""
import re, shutil, sys, zipfile, tempfile, os

path = sys.argv[1]
tmp = tempfile.mkdtemp()

with zipfile.ZipFile(path) as z:
    z.extractall(tmp)

doc_xml_path = os.path.join(tmp, "word", "document.xml")
with open(doc_xml_path, encoding="utf-8") as f:
    doc = f.read()

# 1) strip empty pgNumType (keep ones with attributes)
doc, n_strip = re.subn(r"<w:pgNumType\s*/>", "", doc)

# 2) locate sectPr blocks in order and their pgNumType fmt + footerReference ids
sects = re.findall(r"<w:sectPr[^>]*>.*?</w:sectPr>", doc, flags=re.S)
plan = []  # (footer_rid, fmt)
for s in sects:
    m_fmt = re.search(r'<w:pgNumType[^>]*w:fmt="([^"]+)"', s)
    fmt = m_fmt.group(1) if m_fmt else None
    for m_ref in re.finditer(r'<w:footerReference[^>]*w:type="default"[^>]*r:id="([^"]+)"', s):
        plan.append((m_ref.group(1), fmt))

with open(doc_xml_path, "w", encoding="utf-8") as f:
    f.write(doc)

# 3) resolve rIds -> footer files
rels_path = os.path.join(tmp, "word", "_rels", "document.xml.rels")
with open(rels_path, encoding="utf-8") as f:
    rels = f.read()
rid_to_target = dict(re.findall(r'<Relationship[^>]*Id="([^"]+)"[^>]*Target="([^"]+)"', rels))

patched = []
for rid, fmt in plan:
    target = rid_to_target.get(rid)
    if not target or "footer" not in target:
        continue
    switch = "ROMAN" if fmt == "upperRoman" else ("arabic" if fmt in ("decimal", None) else "arabic")
    fpath = os.path.join(tmp, "word", os.path.basename(target))
    if not os.path.exists(fpath):
        continue
    with open(fpath, encoding="utf-8") as f:
        xml = f.read()
    xml, n = re.subn(
        r"(<w:instrText[^>]*>)\s*PAGE\s*(</w:instrText>)",
        rf"\1 PAGE \\* {switch} \\* MERGEFORMAT \2",
        xml,
    )
    if n:
        with open(fpath, "w", encoding="utf-8") as f:
            f.write(xml)
        patched.append((os.path.basename(target), switch, n))

# 4) rezip
out_tmp = path + ".tmp"
with zipfile.ZipFile(out_tmp, "w", zipfile.ZIP_DEFLATED) as z:
    for root, _, files in os.walk(tmp):
        for name in files:
            full = os.path.join(root, name)
            arc = os.path.relpath(full, tmp)
            z.write(full, arc)
shutil.move(out_tmp, path)
shutil.rmtree(tmp)

print(f"pgNumType stripped: {n_strip}; footers patched: {patched}")
