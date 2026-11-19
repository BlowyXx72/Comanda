"""Genera el PDF del informe final a partir de informe.html.

Uso (desde cualquier carpeta; requiere Python 3 con PyMuPDF y Chrome o Edge):

    python build.py [carpeta_del_html] [pdf_de_salida]

Por defecto toma la carpeta de este script y escribe
../comanda-central-informe-final.pdf.

1. Imprime el HTML con Chrome sin ventana (marcadores desde los encabezados).
2. Lee los marcadores para saber en qué página quedó cada sección.
3. Escribe esos números en el índice y vuelve a imprimir.
4. Reescribe los marcadores con los títulos limpios y fija los metadatos.
"""
import html
import os
import re
import shutil
import subprocess
import sys
import tempfile

import fitz  # PyMuPDF

CHROME_CANDIDATOS = [
    r"C:\Program Files\Google\Chrome\Application\chrome.exe",
    r"C:\Program Files (x86)\Microsoft\Edge\Application\msedge.exe",
    "/usr/bin/google-chrome",
    "/usr/bin/chromium",
]


def chrome():
    for c in CHROME_CANDIDATOS:
        if os.path.exists(c):
            return c
    raise SystemExit("No se encontró Chrome ni Edge")


def imprimir(html_path, pdf_path):
    perfil = tempfile.mkdtemp(prefix="chrome-informe-")
    try:
        cmd = [
            chrome(), "--headless=new", "--disable-gpu", "--no-first-run",
            f"--user-data-dir={perfil}", "--no-pdf-header-footer",
            "--generate-pdf-document-outline", "--virtual-time-budget=15000",
            f"--print-to-pdf={pdf_path}",
            "file:///" + os.path.abspath(html_path).replace("\\", "/"),
        ]
        subprocess.run(cmd, check=True, capture_output=True, timeout=180)
    finally:
        shutil.rmtree(perfil, ignore_errors=True)


def normalizar(t):
    return re.sub(r"\s+", " ", t).strip()


def titulos_html(texto):
    """Encabezados h1-h3 del HTML, en orden y con el texto limpio."""
    salida = []
    for m in re.finditer(r"<h([1-3])\b[^>]*>(.*?)</h\1>", texto, re.S):
        salida.append(normalizar(html.unescape(re.sub(r"<[^>]+>", "", m.group(2)))))
    return salida


def toc_limpio(pdf_path, texto_html):
    """Chrome duplica el texto de algunos marcadores (títulos al inicio de
    página). Los marcadores salen en el mismo orden que los encabezados, así
    que se toman las páginas de Chrome y los títulos del HTML."""
    with fitz.open(pdf_path) as d:
        toc = d.get_toc()
    titulos = titulos_html(texto_html)
    if len(toc) != len(titulos):
        raise SystemExit(f"Marcadores ({len(toc)}) y encabezados ({len(titulos)}) no coinciden")
    return [[nivel, "Portada" if pagina == 1 else titulo, pagina]
            for (nivel, _t, pagina), titulo in zip(toc, titulos)]


def paginas_por_titulo(toc):
    mapa = {}
    for _nivel, titulo, pagina in toc:
        mapa.setdefault(titulo, pagina)
    return mapa


def main():
    aqui = os.path.dirname(os.path.abspath(__file__))
    carpeta = sys.argv[1] if len(sys.argv) > 1 else aqui
    salida = sys.argv[2] if len(sys.argv) > 2 else os.path.join(carpeta, "..", "comanda-central-informe-final.pdf")
    fuente = os.path.join(carpeta, "informe.html")
    con_indice = os.path.join(carpeta, "_informe-con-indice.html")
    tmp = tempfile.mkdtemp(prefix="informe-")
    tmp1, tmp2 = os.path.join(tmp, "pasada1.pdf"), os.path.join(tmp, "pasada2.pdf")

    try:
        texto = open(fuente, encoding="utf-8").read()
        imprimir(fuente, tmp1)
        mapa = paginas_por_titulo(toc_limpio(tmp1, texto))

        faltan = []

        def poner(m):
            titulo = normalizar(html.unescape(m.group(1)))
            if titulo not in mapa:
                faltan.append(titulo)
                return m.group(0)
            return f'<span class="pg" data-h="{m.group(1)}">{mapa[titulo]}</span>'

        con_numeros = re.sub(r'<span class="pg" data-h="([^"]+)">00</span>', poner, texto)
        if faltan:
            print("Sin página en el índice para:", faltan)
        open(con_indice, "w", encoding="utf-8").write(con_numeros)

        imprimir(con_indice, tmp2)
        toc2 = toc_limpio(tmp2, texto)
        mapa2 = paginas_por_titulo(toc2)
        distintos = {t: (mapa[t], mapa2.get(t)) for t in mapa if mapa2.get(t) != mapa[t]}
        if distintos:
            print("Aviso: cambiaron páginas entre pasadas:", distintos)

        with fitz.open(tmp2) as d:
            d.set_toc(toc2)
            d.set_metadata({
                "title": "Comanda Central — Informe final del proyecto",
                "author": "Dikersson Alexis Cañón Vanegas; Miguel Jiménez",
                "subject": "Servicios Telemáticos — Informe final: prototipo, pruebas y despliegue en AWS",
                "keywords": "Comanda Central, servicios telemáticos, WebSocket, TLS 1.3, HTTP/2, PostgreSQL, RLS, AWS",
                "creator": "HTML + Chrome (headless)",
                "producer": "PyMuPDF",
            })
            d.save(os.path.abspath(salida), garbage=3, deflate=True)
            print("PDF:", os.path.abspath(salida), "| páginas:", d.page_count)
    finally:
        shutil.rmtree(tmp, ignore_errors=True)
        if os.path.exists(con_indice):
            os.remove(con_indice)


if __name__ == "__main__":
    main()
