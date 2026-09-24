from flask import Flask, render_template, request, jsonify, send_file
from dotenv import load_dotenv
import requests

from reportlab.lib.pagesizes import A4
from reportlab.pdfgen import canvas
from reportlab.lib import colors
from reportlab.pdfbase.pdfmetrics import stringWidth
from reportlab.lib.units import mm

import os
import io
import base64
import re
from pathlib import Path
import pymupdf


# ============================================================
# CONFIGURAÇÃO
# ============================================================

# Carrega o .env sempre a partir da pasta deste app.
# Isso evita depender da pasta em que o comando "python app.py"
# foi executado.
BASE_DIR = Path(__file__).resolve().parent
ENV_FILE = BASE_DIR / ".env"
load_dotenv(dotenv_path=ENV_FILE, override=True)

app = Flask(__name__)

supabase_url = (
    os.environ.get("SUPABASE_URL")
    or os.environ.get("SUPABASE_PROJECT_URL")
    or ""
).strip().rstrip("/")

supabase_key = (
    os.environ.get("SUPABASE_KEY")
    or os.environ.get("SUPABASE_PUBLISHABLE_KEY")
    or os.environ.get("SUPABASE_ANON_KEY")
    or ""
).strip()

REQUEST_TIMEOUT = int(os.environ.get("REQUEST_TIMEOUT", "15"))

if supabase_url and supabase_key:
    print(f"Supabase configurado: {supabase_url}")
else:
    print(f"ERRO: configuração do Supabase não encontrada em: {ENV_FILE}")
    print("Crie/complete o arquivo .env com SUPABASE_URL e SUPABASE_KEY.")

def _token_from_request():
    auth = request.headers.get("Authorization", "")
    return auth.split(" ", 1)[1].strip() if auth.lower().startswith("bearer ") else None

def _headers(token=None, json_body=False):
    h={"apikey":supabase_key}
    if token: h["Authorization"]=f"Bearer {token}"
    if json_body: h["Content-Type"]="application/json"
    return h

def _rest(method,path,token,**kwargs):
    if not supabase_url or not supabase_key: raise RuntimeError("SUPABASE_URL/SUPABASE_KEY não configurados no servidor.")
    body=kwargs.get("json") is not None
    extra=kwargs.pop("headers",{}) or {}
    h=_headers(token,body); h.update(extra)
    return requests.request(method,f"{supabase_url}{path}",headers=h,timeout=REQUEST_TIMEOUT,**kwargs)

def _auth_user(token):
    r=requests.get(f"{supabase_url}/auth/v1/user",headers=_headers(token),timeout=REQUEST_TIMEOUT)
    if not r.ok: raise PermissionError("Sessão do cliente inválida ou expirada.")
    return r.json()

def _rpc_access(token):
    r=_rest("POST","/rest/v1/rpc/verificar_acesso_cliente",token,json={})
    if not r.ok: raise PermissionError("Não foi possível verificar o acesso do cliente.")
    d=r.json(); return d[0] if isinstance(d,list) and d else (d or {})

def _contexto_cliente():
    token=_token_from_request()
    if not token: raise PermissionError("Token de acesso não enviado.")
    user=_auth_user(token); acesso=_rpc_access(token)
    if not acesso.get("permitido"): raise PermissionError(acesso.get("motivo") or "Acesso do cliente não está liberado.")
    cid=acesso.get("cliente_id")
    if not cid: raise PermissionError("Cliente não encontrado para esta sessão.")
    params={"select":"ativo,modulo_id,modulos!inner(slug,ativo)","cliente_id":f"eq.{cid}","ativo":"eq.true","modulos.slug":"eq.cartazeamento","modulos.ativo":"eq.true"}
    r=_rest("GET","/rest/v1/cliente_modulos",token,params=params)
    if not r.ok: raise PermissionError("Não foi possível verificar a permissão do Cartazeamento.")
    if not r.json(): raise PermissionError("Cartazeamento não está liberado para este cliente.")
    return token,user,acesso

def _erro_auth(e):
    return jsonify({"erro":str(e)}),401 if "token" in str(e).lower() or "sessão" in str(e).lower() else 403


# ============================================================
# PÁGINAS
# ============================================================

@app.route("/")
def home():
    return render_template("index.html")


@app.route("/editor")
def editor():
    return render_template("editor.html")


# ============================================================
# TESTE SUPABASE
# ============================================================

@app.route("/api/saude")
def api_saude(): return jsonify({"ok":True,"servico":"River Cartazeamento"})

@app.route("/api/sessao")
def api_sessao():
    try:
        _,user,acesso=_contexto_cliente()
        return jsonify({"ok":True,"user_id":user.get("id"),"email":user.get("email"),"cliente_id":acesso.get("cliente_id"),"cliente_nome":acesso.get("cliente_nome"),"dias_restantes":acesso.get("dias_restantes")})
    except PermissionError as e: return _erro_auth(e)
    except Exception as e:
        print("ERRO /api/sessao:",e); return jsonify({"erro":"Não foi possível validar a sessão."}),500


# ============================================================
# UTILITÁRIOS
# ============================================================

def limpar_preco(valor):
    if valor is None:
        return ""
    return str(valor).strip()


def formatar_preco(valor):
    valor = limpar_preco(valor)
    if not valor:
        return ""

    valor = re.sub(r"R\$\s*", "", valor)
    return f"R$ {valor}"


def converter_preco_numerico(valor):
    valor = limpar_preco(valor)

    if not valor:
        return None

    valor = re.sub(r"R\$\s*", "", valor)

    # Aceita 1.234,56 / 1234,56 / 1234.56
    if "," in valor:
        valor = valor.replace(".", "")
        valor = valor.replace(",", ".")
    else:
        partes = valor.split(".")
        if len(partes) > 2:
            valor = valor.replace(".", "")

    try:
        return float(valor)
    except (ValueError, TypeError):
        return None


def calcular_desconto(preco_de, preco_oferta):
    valor_de = converter_preco_numerico(preco_de)
    valor_oferta = converter_preco_numerico(preco_oferta)

    if (
        valor_de is None
        or valor_oferta is None
        or valor_de <= 0
        or valor_oferta <= 0
        or valor_oferta >= valor_de
    ):
        return None

    desconto = ((valor_de - valor_oferta) / valor_de) * 100
    return round(desconto)


def ajustar_texto(c, texto, fonte, tamanho_maximo, largura_maxima):
    texto = str(texto or "").strip()

    if not texto:
        return 8

    tamanho = float(tamanho_maximo)

    while tamanho > 8:
        largura = stringWidth(texto, fonte, tamanho)

        if largura <= largura_maxima:
            return tamanho

        tamanho -= 1

    return 8


def texto_centralizado(c, texto, x, y, fonte, tamanho, cor):
    c.setFont(fonte, tamanho)
    c.setFillColor(cor)
    c.drawCentredString(x, y, texto)


def obter_unidade(produto):
    unidade = str(
        produto.get("unidade", "UN") or "UN"
    ).strip()

    return unidade.upper()


def obter_chamada(produto, padrao="OFERTA"):
    chamada = str(
        produto.get("chamada", padrao) or padrao
    ).strip()

    return chamada.upper()


def obter_edicao_elemento(edicao, nome):
    if not edicao:
        return None

    return (
        edicao
        .get("elementos", {})
        .get(nome)
    )


def elemento_visivel(edicao, nome):
    item = obter_edicao_elemento(edicao, nome)

    if item is None:
        return True

    return item.get("visivel", True)


def dimensoes_elemento_pdf(
    item,
    placa_x,
    placa_y,
    placa_largura,
    placa_altura,
    largura_padrao_percent=0,
    altura_padrao_percent=0
):
    """
    Converte os dados do editor HTML, cuja origem é o canto
    superior esquerdo, para coordenadas do ReportLab.

    Retorna:
        centro_x, topo_y, largura, altura
    """

    if not item:
        return None

    x_percent = float(
        item.get("xPercent", 0) or 0
    )

    y_percent = float(
        item.get("yPercent", 0) or 0
    )

    largura_percent = float(
        item.get(
            "larguraPercent",
            largura_padrao_percent
        ) or largura_padrao_percent
    )

    altura_percent = float(
        item.get(
            "alturaPercent",
            altura_padrao_percent
        ) or altura_padrao_percent
    )

    largura_elemento = (
        placa_largura
        * largura_percent
        / 100
    )

    altura_elemento = (
        placa_altura
        * altura_percent
        / 100
    )

    esquerda = (
        placa_x
        + placa_largura * x_percent / 100
    )

    topo = (
        placa_y
        + placa_altura
        - placa_altura * y_percent / 100
    )

    centro_x = esquerda + largura_elemento / 2

    return (
        centro_x,
        topo,
        largura_elemento,
        altura_elemento
    )


def tamanho_manual_elemento(item, altura_elemento, fator=0.80, minimo=8):
    if not item:
        return max(minimo, altura_elemento * fator)

    tamanho = item.get("fontSize")

    if tamanho is None or tamanho == "":
        tamanho = altura_elemento * fator

    try:
        return max(minimo, float(tamanho))
    except (ValueError, TypeError):
        return max(minimo, altura_elemento * fator)


# ============================================================
# QUEBRA INTELIGENTE DO NOME
# ============================================================

def quebrar_texto_duas_linhas(
    c,
    texto,
    fonte,
    tamanho,
    largura_maxima
):
    texto = str(texto or "").strip()

    if not texto:
        return [""]

    if stringWidth(texto, fonte, tamanho) <= largura_maxima:
        return [texto]

    palavras = texto.split()

    if len(palavras) == 1:
        return [texto]

    melhor_linha_1 = ""
    melhor_linha_2 = ""
    menor_diferenca = float("inf")

    for i in range(1, len(palavras)):
        linha_1 = " ".join(palavras[:i])
        linha_2 = " ".join(palavras[i:])

        largura_1 = stringWidth(
            linha_1, fonte, tamanho
        )

        largura_2 = stringWidth(
            linha_2, fonte, tamanho
        )

        if (
            largura_1 <= largura_maxima
            and largura_2 <= largura_maxima
        ):
            diferenca = abs(largura_1 - largura_2)

            if diferenca < menor_diferenca:
                menor_diferenca = diferenca
                melhor_linha_1 = linha_1
                melhor_linha_2 = linha_2

    if melhor_linha_1:
        return [
            melhor_linha_1,
            melhor_linha_2
        ]

    metade = max(1, len(palavras) // 2)

    return [
        " ".join(palavras[:metade]),
        " ".join(palavras[metade:])
    ]


def desenhar_produto(
    c,
    nome,
    centro_x,
    centro_y,
    largura_maxima,
    tamanho_maximo,
    cor
):
    nome = str(nome or "").strip()

    if not nome:
        return

    tamanho = float(tamanho_maximo)
    linhas = [nome]

    while tamanho > 8:
        linhas = quebrar_texto_duas_linhas(
            c,
            nome,
            "Helvetica-Bold",
            tamanho,
            largura_maxima
        )

        todas_cabem = True

        for linha in linhas:
            if stringWidth(
                linha,
                "Helvetica-Bold",
                tamanho
            ) > largura_maxima:
                todas_cabem = False
                break

        if todas_cabem:
            break

        tamanho -= 1

    espacamento = tamanho * 1.12

    if len(linhas) == 1:
        texto_centralizado(
            c,
            linhas[0],
            centro_x,
            centro_y,
            "Helvetica-Bold",
            tamanho,
            cor
        )
    else:
        texto_centralizado(
            c,
            linhas[0],
            centro_x,
            centro_y + espacamento / 2,
            "Helvetica-Bold",
            tamanho,
            cor
        )

        texto_centralizado(
            c,
            linhas[1],
            centro_x,
            centro_y - espacamento / 2,
            "Helvetica-Bold",
            tamanho,
            cor
        )


# ============================================================
# OBSERVAÇÃO
# ============================================================

def desenhar_observacao(
    c,
    texto,
    centro_x,
    y,
    largura_maxima,
    tamanho_maximo,
    cor
):
    texto = str(texto or "").strip()

    if not texto:
        return

    tamanho = ajustar_texto(
        c,
        texto,
        "Helvetica",
        tamanho_maximo,
        largura_maxima
    )

    texto_centralizado(
        c,
        texto,
        centro_x,
        y,
        "Helvetica",
        tamanho,
        cor
    )


def desenhar_observacao_visual(
    c,
    texto,
    placa_x,
    placa_y,
    placa_largura,
    placa_altura,
    centro_x,
    posicao_y_automatica,
    tamanho_maximo,
    largura_maxima,
    cor,
    edicao=None
):
    texto = str(texto or "").strip()

    if not texto:
        return

    item = obter_edicao_elemento(
        edicao,
        "observacao"
    )

    if item is not None:
        if not item.get("visivel", True):
            return

        dados = dimensoes_elemento_pdf(
            item,
            placa_x,
            placa_y,
            placa_largura,
            placa_altura,
            largura_padrao_percent=70,
            altura_padrao_percent=6
        )

        centro_obs, topo_obs, largura_obs, altura_obs = dados

        tamanho = tamanho_manual_elemento(
            item,
            altura_obs,
            fator=0.80,
            minimo=8
        )

        # A largura escolhida no editor vira limite visual.
        tamanho = ajustar_texto(
            c,
            texto,
            "Helvetica",
            tamanho,
            max(20, largura_obs)
        )

        y_obs = topo_obs - tamanho

        texto_centralizado(
            c,
            texto,
            centro_obs,
            y_obs,
            "Helvetica",
            tamanho,
            cor
        )

        return

    desenhar_observacao(
        c,
        texto,
        centro_x,
        posicao_y_automatica,
        largura_maxima,
        tamanho_maximo,
        cor
    )


# ============================================================
# CHAMADA PROMOCIONAL
# ============================================================

def desenhar_chamada_visual(
    c,
    chamada,
    placa_x,
    placa_y,
    placa_largura,
    placa_altura,
    centro_x,
    posicao_y_automatica,
    tamanho_maximo,
    largura_maxima,
    cor,
    edicao=None
):
    chamada = str(chamada or "").strip()

    if not chamada:
        return

    item = obter_edicao_elemento(
        edicao,
        "chamada"
    )

    if item is not None:
        if not item.get("visivel", True):
            return

        dados = dimensoes_elemento_pdf(
            item,
            placa_x,
            placa_y,
            placa_largura,
            placa_altura,
            largura_padrao_percent=80,
            altura_padrao_percent=10
        )

        centro_chamada, topo_chamada, largura_chamada, altura_chamada = dados

        tamanho = tamanho_manual_elemento(
            item,
            altura_chamada,
            fator=0.80,
            minimo=8
        )

        tamanho = ajustar_texto(
            c,
            chamada,
            "Helvetica-Bold",
            tamanho,
            max(20, largura_chamada)
        )

        y_chamada = topo_chamada - tamanho

        texto_centralizado(
            c,
            chamada,
            centro_chamada,
            y_chamada,
            "Helvetica-Bold",
            tamanho,
            cor
        )

        return

    tamanho_chamada = ajustar_texto(
        c,
        chamada,
        "Helvetica-Bold",
        tamanho_maximo,
        largura_maxima
    )

    texto_centralizado(
        c,
        chamada,
        centro_x,
        posicao_y_automatica,
        "Helvetica-Bold",
        tamanho_chamada,
        cor
    )


# ============================================================
# NOME VISUAL
# ============================================================

def desenhar_nome_visual(
    c,
    nome,
    placa_x,
    placa_y,
    placa_largura,
    placa_altura,
    centro_x,
    posicao_y_automatica,
    tamanho_maximo,
    largura_maxima,
    cor,
    edicao=None
):
    nome = str(nome or "").strip()

    if not nome:
        return

    item = obter_edicao_elemento(
        edicao,
        "nome"
    )

    if item is not None:
        if not item.get("visivel", True):
            return

        dados = dimensoes_elemento_pdf(
            item,
            placa_x,
            placa_y,
            placa_largura,
            placa_altura,
            largura_padrao_percent=84,
            altura_padrao_percent=12
        )

        centro_nome, topo_nome, largura_nome, altura_nome = dados

        tamanho = tamanho_manual_elemento(
            item,
            altura_nome,
            fator=0.80,
            minimo=8
        )

        # O editor controla o tamanho; apenas reduzimos se o texto
        # não couber na largura visual escolhida.
        tamanho = ajustar_texto(
            c,
            nome,
            "Helvetica-Bold",
            tamanho,
            max(20, largura_nome)
        )

        # Para preservar o comportamento visual do editor, o nome
        # pode ocupar uma ou duas linhas.
        linhas = quebrar_texto_duas_linhas(
            c,
            nome,
            "Helvetica-Bold",
            tamanho,
            max(20, largura_nome)
        )

        espacamento = tamanho * 1.12

        if len(linhas) == 1:
            y_nome = topo_nome - tamanho

            texto_centralizado(
                c,
                linhas[0],
                centro_nome,
                y_nome,
                "Helvetica-Bold",
                tamanho,
                cor
            )
        else:
            centro_y = topo_nome - tamanho

            texto_centralizado(
                c,
                linhas[0],
                centro_nome,
                centro_y + espacamento / 2,
                "Helvetica-Bold",
                tamanho,
                cor
            )

            texto_centralizado(
                c,
                linhas[1],
                centro_nome,
                centro_y - espacamento / 2,
                "Helvetica-Bold",
                tamanho,
                cor
            )

        return

    desenhar_produto(
        c,
        nome,
        centro_x,
        posicao_y_automatica,
        largura_maxima,
        tamanho_maximo,
        cor
    )


# ============================================================
# PREÇO ANTIGO
# ============================================================

def desenhar_preco_antigo(
    c,
    texto,
    centro_x,
    y,
    tamanho,
    cor=colors.HexColor("#666666")
):
    if not texto:
        return

    texto = formatar_preco(texto)

    c.setFont(
        "Helvetica",
        tamanho
    )

    c.setFillColor(
        cor
    )

    largura_texto = stringWidth(
        texto,
        "Helvetica",
        tamanho
    )

    c.drawCentredString(
        centro_x,
        y,
        texto
    )

    c.saveState()

    c.setStrokeColor(cor)

    c.setLineWidth(
        max(
            0.8,
            tamanho * 0.055
        )
    )

    c.line(
        centro_x - largura_texto / 2,
        y + tamanho * 0.34,
        centro_x + largura_texto / 2,
        y + tamanho * 0.34
    )

    c.restoreState()


# ============================================================
# PREÇO PRINCIPAL
# ============================================================

def perfil_tamanho_placa(largura, altura):
    """Ajustes finos de composição por tamanho, sem editor manual."""
    if largura < 300:
        return {"nome": "P", "preco": 0.80, "preco_y": 0.0, "por": 0.22, "por_y": 0.42, "un_y": -0.16, "nome_fator": 1.0, "nome_y": 0.0, "selo_y": 0.0}
    if largura < 700 and altura < 600:
        return {"nome": "M", "preco": 0.90, "preco_y": -0.025, "por": 0.28, "por_y": 0.0, "un_y": -0.13, "nome_fator": 1.0, "nome_y": -0.020, "selo_y": 0.0}
    if largura < 700:
        return {"nome": "G", "preco": 1.08, "preco_y": 0.0, "por": 0.28, "por_y": 0.42, "un_y": -0.13, "nome_fator": 1.08, "nome_y": 0.0, "selo_y": 0.0}
    if largura < 1000:
        return {"nome": "GG", "preco": 1.08, "preco_y": 0.0, "por": 0.28, "por_y": 0.32, "un_y": -0.13, "nome_fator": 1.06, "nome_y": 0.0, "selo_y": -0.045}
    return {"nome": "XG", "preco": 1.0, "preco_y": 0.0, "por": 0.28, "por_y": 0.0, "un_y": 0.0, "nome_fator": 1.0, "nome_y": 0.0, "selo_y": 0.0}


def desenhar_preco_destaque(
    c,
    preco,
    centro_x,
    y,
    largura_maxima,
    altura_maxima,
    cor,
    tamanho_manual=None,
    fator_tamanho=1.0
):
    preco = str(preco or "").strip()

    if not preco:
        return None

    preco = (
        preco
        .replace("R$", "")
        .replace("r$", "")
        .strip()
    )

    try:
        if "," in preco:
            partes = preco.split(",")

            inteiro = re.sub(
                r"[^\d]",
                "",
                partes[0]
            )

            centavos = re.sub(
                r"[^\d]",
                "",
                partes[1]
            )[:2]
        else:
            partes = preco.split(".")

            if (
                len(partes) == 2
                and len(partes[1]) <= 2
            ):
                inteiro = re.sub(
                    r"[^\d]",
                    "",
                    partes[0]
                )

                centavos = re.sub(
                    r"[^\d]",
                    "",
                    partes[1]
                )[:2]
            else:
                inteiro = re.sub(
                    r"[^\d]",
                    "",
                    preco
                )

                centavos = "00"

    except Exception:
        return None

    if not inteiro:
        return None

    if not centavos:
        centavos = "00"

    centavos = centavos.ljust(2, "0")

    if tamanho_manual:
        tamanho_inteiro = float(tamanho_manual)
    else:
        tamanho_inteiro = min(
            altura_maxima * 5.4,
            largura_maxima * 0.58
        )

        tamanho_inteiro = max(
            34,
            tamanho_inteiro
        )

        tamanho_inteiro *= float(fator_tamanho or 1.0)

    tamanho_rs = tamanho_inteiro * 0.27
    tamanho_centavos = tamanho_inteiro * 0.46

    fonte_inteiro = "Helvetica-Bold"
    fonte_rs = "Helvetica-Bold"
    fonte_centavos = "Helvetica-Bold"

    largura_rs = stringWidth(
        "R$",
        fonte_rs,
        tamanho_rs
    )

    largura_inteiro = stringWidth(
        inteiro,
        fonte_inteiro,
        tamanho_inteiro
    )

    largura_centavos = stringWidth(
        "," + centavos,
        fonte_centavos,
        tamanho_centavos
    )

    espacamento_rs = tamanho_inteiro * 0.045
    espacamento_centavos = tamanho_inteiro * 0.035

    largura_total = (
        largura_rs
        + espacamento_rs
        + largura_inteiro
        + espacamento_centavos
        + largura_centavos
    )

    if not tamanho_manual:
        while (
            largura_total > largura_maxima
            and tamanho_inteiro > 18
        ):
            tamanho_inteiro *= 0.95

            tamanho_rs = tamanho_inteiro * 0.27
            tamanho_centavos = tamanho_inteiro * 0.46

            largura_rs = stringWidth(
                "R$",
                fonte_rs,
                tamanho_rs
            )

            largura_inteiro = stringWidth(
                inteiro,
                fonte_inteiro,
                tamanho_inteiro
            )

            largura_centavos = stringWidth(
                "," + centavos,
                fonte_centavos,
                tamanho_centavos
            )

            espacamento_rs = tamanho_inteiro * 0.045
            espacamento_centavos = tamanho_inteiro * 0.035

            largura_total = (
                largura_rs
                + espacamento_rs
                + largura_inteiro
                + espacamento_centavos
                + largura_centavos
            )

    x_inicio = (
        centro_x
        - largura_total / 2
    )

    c.setFillColor(cor)

    c.setFont(
        fonte_rs,
        tamanho_rs
    )

    c.drawString(
        x_inicio,
        y + tamanho_inteiro * 0.33,
        "R$"
    )

    x_inteiro = (
        x_inicio
        + largura_rs
        + espacamento_rs
    )

    c.setFont(
        fonte_inteiro,
        tamanho_inteiro
    )

    c.drawString(
        x_inteiro,
        y,
        inteiro
    )

    x_centavos = (
        x_inteiro
        + largura_inteiro
        + espacamento_centavos
    )

    c.setFont(
        fonte_centavos,
        tamanho_centavos
    )

    c.drawString(
        x_centavos,
        y + tamanho_inteiro * 0.35,
        "," + centavos
    )

    return {
        "tamanho_inteiro": tamanho_inteiro,
        "largura_total": largura_total,
        "x_inicio": x_inicio,
        "x_fim": x_inicio + largura_total,
        "y": y
    }


# ============================================================
# SELO
# ============================================================

def desenhar_selo_desconto(
    c,
    percentual,
    centro_x,
    centro_y,
    tamanho_base,
    cor_fundo,
    cor_texto=colors.white
):
    if percentual is None:
        return

    texto = f"-{percentual}%"

    raio = max(
        14,
        tamanho_base * 0.70
    )

    raio = min(
        raio,
        35
    )

    c.saveState()

    c.setFillColor(cor_fundo)

    c.circle(
        centro_x,
        centro_y,
        raio,
        fill=1,
        stroke=0
    )

    c.setStrokeColor(cor_texto)

    c.setLineWidth(
        max(
            0.8,
            raio * 0.055
        )
    )

    c.circle(
        centro_x,
        centro_y,
        raio * 0.82,
        fill=0,
        stroke=1
    )

    tamanho = ajustar_texto(
        c,
        texto,
        "Helvetica-Bold",
        raio * 0.72,
        raio * 1.55
    )

    texto_centralizado(
        c,
        texto,
        centro_x,
        centro_y - tamanho * 0.35,
        "Helvetica-Bold",
        tamanho,
        cor_texto
    )

    c.restoreState()


# ============================================================
# BLOCO COMERCIAL DE PREÇO
# ============================================================

def desenhar_bloco_preco(
    c,
    produto,
    centro_x,
    centro_y,
    largura,
    altura,
    cor_preco,
    cor_secundaria,
    cor_selo=None,
    edicao=None,
    placa_x=None,
    placa_y=None,
    placa_largura=None,
    placa_altura=None
):
    preco_de = (
        produto.get("preco_de")
        or produto.get("precoDe")
        or produto.get("preco_anterior")
        or produto.get("precoAnterior")
        or produto.get("de")
        or ""
    )

    preco_por = (
        produto.get("preco_por")
        or produto.get("precoPor")
        or produto.get("preco_atual")
        or produto.get("precoAtual")
        or produto.get("por")
        or produto.get("preco")
        or ""
    )

    preco_de = str(preco_de).strip()
    preco_por = str(preco_por).strip()

    unidade = obter_unidade(produto)

    if not unidade:
        unidade = "UN"

    if cor_selo is None:
        cor_selo = cor_preco

    formato_horizontal = largura > altura * 1.20
    perfil = perfil_tamanho_placa(largura, altura)

    if formato_horizontal:
        y_de = centro_y + altura * 0.42
        y_principal = centro_y - altura * 0.30
    else:
        y_de = centro_y + altura * 0.42
        y_principal = centro_y - altura * 0.28

    y_principal += altura * perfil["preco_y"]

    # ========================================================
    # DE
    # ========================================================

    edicao_de = obter_edicao_elemento(edicao, "de")

    if preco_de:
        texto_antigo = formatar_preco(preco_de)

        if (
            edicao_de is not None
            and edicao_de.get("visivel", True)
            and placa_largura
            and placa_altura
        ):
            dados = dimensoes_elemento_pdf(
                edicao_de,
                placa_x,
                placa_y,
                placa_largura,
                placa_altura,
                largura_padrao_percent=35,
                altura_padrao_percent=7
            )

            centro_de, topo_de, largura_de_elem, altura_de_elem = dados

            tamanho_de_manual = tamanho_manual_elemento(
                edicao_de,
                altura_de_elem,
                fator=0.65,
                minimo=8
            )

            y_de_manual = topo_de - tamanho_de_manual

            texto_de = "DE"

            largura_de = stringWidth(
                texto_de,
                "Helvetica-Bold",
                tamanho_de_manual
            )

            largura_antigo = stringWidth(
                texto_antigo,
                "Helvetica",
                tamanho_de_manual
            )

            espaco = max(
                4,
                tamanho_de_manual * 0.25
            )

            largura_total = (
                largura_de
                + espaco
                + largura_antigo
            )

            x_inicio = (
                centro_de
                - largura_total / 2
            )

            texto_centralizado(
                c,
                texto_de,
                x_inicio + largura_de / 2,
                y_de_manual,
                "Helvetica-Bold",
                tamanho_de_manual,
                cor_secundaria
            )

            x_antigo = (
                x_inicio
                + largura_de
                + espaco
                + largura_antigo / 2
            )

            texto_centralizado(
                c,
                texto_antigo,
                x_antigo,
                y_de_manual,
                "Helvetica",
                tamanho_de_manual,
                cor_secundaria
            )

            c.saveState()
            c.setStrokeColor(cor_secundaria)
            c.setLineWidth(
                max(
                    0.8,
                    tamanho_de_manual * 0.055
                )
            )

            c.line(
                x_antigo - largura_antigo / 2,
                y_de_manual + tamanho_de_manual * 0.30,
                x_antigo + largura_antigo / 2,
                y_de_manual + tamanho_de_manual * 0.30
            )

            c.restoreState()

        elif not (
            edicao_de is not None
            and not edicao_de.get("visivel", True)
        ):
            tamanho_antigo = max(
                12,
                min(
                    20,
                    largura * 0.040
                )
            )

            tamanho_de = tamanho_antigo * 0.90

            largura_de = stringWidth(
                "DE",
                "Helvetica-Bold",
                tamanho_de
            )

            largura_antigo = stringWidth(
                texto_antigo,
                "Helvetica",
                tamanho_antigo
            )

            espaco = max(
                6,
                tamanho_antigo * 0.30
            )

            largura_total_de = (
                largura_de
                + espaco
                + largura_antigo
            )

            x_inicio_de = (
                centro_x
                - largura_total_de / 2
            )

            texto_centralizado(
                c,
                "DE",
                x_inicio_de + largura_de / 2,
                y_de,
                "Helvetica-Bold",
                tamanho_de,
                cor_secundaria
            )

            x_antigo = (
                x_inicio_de
                + largura_de
                + espaco
                + largura_antigo / 2
            )

            texto_centralizado(
                c,
                texto_antigo,
                x_antigo,
                y_de,
                "Helvetica",
                tamanho_antigo,
                cor_secundaria
            )

            c.saveState()
            c.setStrokeColor(cor_secundaria)
            c.setLineWidth(
                max(
                    0.8,
                    tamanho_antigo * 0.055
                )
            )

            c.line(
                x_antigo - largura_antigo / 2,
                y_de + tamanho_antigo * 0.30,
                x_antigo + largura_antigo / 2,
                y_de + tamanho_antigo * 0.30
            )

            c.restoreState()

    # ========================================================
    # PREÇO PRINCIPAL
    # ========================================================

    preco_info = None
    edicao_preco = obter_edicao_elemento(edicao, "preco")

    if preco_por:
        altura_preco = (
            altura * 0.40
            if formato_horizontal
            else altura * 0.45
        )

        if (
            edicao_preco is not None
            and edicao_preco.get("visivel", True)
            and placa_largura
            and placa_altura
        ):
            dados = dimensoes_elemento_pdf(
                edicao_preco,
                placa_x,
                placa_y,
                placa_largura,
                placa_altura,
                largura_padrao_percent=55,
                altura_padrao_percent=25
            )

            centro_preco, topo_preco, largura_elem, altura_elem = dados

            tamanho_preco = edicao_preco.get("fontSize")

            if not tamanho_preco:
                tamanho_preco = altura_elem * 0.80
            else:
                # O editor usa px; compensação visual para ReportLab.
                tamanho_preco = float(tamanho_preco) * 1.3333

            tamanho_preco = max(
                18,
                float(tamanho_preco)
            )

            y_preco = topo_preco - tamanho_preco

            preco_info = desenhar_preco_destaque(
                c,
                preco_por,
                centro_preco,
                y_preco,
                max(30, largura_elem),
                max(30, altura_elem),
                cor_preco,
                tamanho_manual=tamanho_preco
            )

        elif not (
            edicao_preco is not None
            and not edicao_preco.get("visivel", True)
        ):
            preco_info = desenhar_preco_destaque(
                c,
                preco_por,
                centro_x,
                y_principal,
                largura * 0.76,
                altura_preco,
                cor_preco,
                fator_tamanho=perfil["preco"]
            )

    # ========================================================
    # POR
    # ========================================================

    edicao_por = obter_edicao_elemento(edicao, "por")

    if preco_info:
        if edicao_por is not None:
            if edicao_por.get("visivel", True):
                if placa_largura and placa_altura:
                    dados = dimensoes_elemento_pdf(
                        edicao_por,
                        placa_x,
                        placa_y,
                        placa_largura,
                        placa_altura,
                        largura_padrao_percent=18,
                        altura_padrao_percent=8
                    )

                    x_por, topo_por, largura_por_elem, altura_por_elem = dados

                    tamanho_por = tamanho_manual_elemento(
                        edicao_por,
                        altura_por_elem,
                        fator=0.80,
                        minimo=8
                    )

                    y_por = topo_por - tamanho_por

                    texto_centralizado(
                        c,
                        "POR",
                        x_por,
                        y_por,
                        "Helvetica-Bold",
                        tamanho_por,
                        cor_secundaria
                    )
        else:
            tamanho_inteiro = preco_info["tamanho_inteiro"]
            x_inicio = preco_info["x_inicio"]

            tamanho_por = max(
                11,
                min(
                    22,
                    tamanho_inteiro * perfil["por"]
                )
            )

            largura_por = stringWidth(
                "POR",
                "Helvetica-Bold",
                tamanho_por
            )

            espaco_por = max(
                8,
                tamanho_inteiro * 0.16
            )

            x_por = (
                x_inicio
                - espaco_por
                - largura_por / 2
            )

            y_por = (
                y_principal
                + tamanho_inteiro * (0.30 + perfil["por_y"])
            )

            limite_esquerdo = (
                centro_x
                - largura * 0.45
            )

            if (
                x_por - largura_por / 2
                < limite_esquerdo
            ):
                x_por = (
                    limite_esquerdo
                    + largura_por / 2
                )

            texto_centralizado(
                c,
                "POR",
                x_por,
                y_por,
                "Helvetica-Bold",
                tamanho_por,
                cor_secundaria
            )

    # ========================================================
    # UNIDADE
    # ========================================================

    if preco_info:
        tamanho_inteiro = preco_info["tamanho_inteiro"]
        x_fim = preco_info["x_fim"]

        tamanho_unidade = max(
            12,
            min(
                22,
                tamanho_inteiro * 0.24
            )
        )

        x_unidade = (
            x_fim
            + tamanho_inteiro * 0.04
        )

        y_unidade = (
            y_principal
            - tamanho_inteiro * (0.05 - perfil["un_y"])
        )

        edicao_unidade = obter_edicao_elemento(
            edicao,
            "unidade"
        )

        if (
            edicao_unidade is not None
            and edicao_unidade.get("visivel", True)
            and placa_largura
            and placa_altura
        ):
            dados = dimensoes_elemento_pdf(
                edicao_unidade,
                placa_x,
                placa_y,
                placa_largura,
                placa_altura,
                largura_padrao_percent=12,
                altura_padrao_percent=8
            )

            x_unidade, topo_unidade, largura_unidade_elem, altura_unidade_elem = dados

            tamanho_unidade = tamanho_manual_elemento(
                edicao_unidade,
                altura_unidade_elem,
                fator=0.80,
                minimo=8
            )

            y_unidade = (
                topo_unidade
                - tamanho_unidade
            )

        if not (
            edicao_unidade is not None
            and not edicao_unidade.get("visivel", True)
        ):
            texto_centralizado(
                c,
                unidade,
                x_unidade,
                y_unidade,
                "Helvetica-Bold",
                tamanho_unidade,
                cor_secundaria
            )

    # ========================================================
    # SELO
    # ========================================================

    desconto = calcular_desconto(
        preco_de,
        preco_por
    )

    if desconto is not None:
        selo_x = centro_x + largura * 0.35
        selo_y = centro_y - altura * 0.23 + altura * perfil["selo_y"]

        tamanho_selo = max(
            20,
            min(
                42,
                altura * 0.18
            )
        )

        edicao_selo = obter_edicao_elemento(
            edicao,
            "selo"
        )

        if (
            edicao_selo is not None
            and edicao_selo.get("visivel", True)
            and placa_largura
            and placa_altura
        ):
            dados = dimensoes_elemento_pdf(
                edicao_selo,
                placa_x,
                placa_y,
                placa_largura,
                placa_altura,
                largura_padrao_percent=14,
                altura_padrao_percent=14
            )

            selo_x, topo_selo, largura_selo, altura_selo = dados

            tamanho_selo_manual = max(
                14,
                min(
                    largura_selo,
                    altura_selo
                ) / 2
            )

            selo_y = (
                topo_selo
                - altura_selo / 2
            )

            desenhar_selo_desconto(
                c,
                desconto,
                selo_x,
                selo_y,
                tamanho_selo_manual,
                cor_selo
            )

        elif edicao_selo is None:
            desenhar_selo_desconto(
                c,
                desconto,
                selo_x,
                selo_y,
                tamanho_selo,
                cor_selo
            )


# ============================================================
# LAYOUT 1 — VAREJO CLÁSSICO
# ============================================================

def desenhar_layout_classico(
    c, produto, x, y, largura, altura, edicao=None
):
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    c.setFillColor(colors.white)
    c.rect(x, y, largura, altura, fill=1, stroke=0)

    c.setStrokeColor(colors.HexColor("#d9d9d9"))
    c.setLineWidth(max(1, largura * 0.004))
    c.rect(x, y, largura, altura, fill=0, stroke=1)

    c.setFillColor(colors.HexColor("#c90000"))
    c.rect(
        x, y + altura * 0.79,
        largura, altura * 0.16,
        fill=1, stroke=0
    )

    c.setFillColor(colors.HexColor("#ffd400"))
    c.rect(
        x, y + altura * 0.75,
        largura, altura * 0.04,
        fill=1, stroke=0
    )

    desenhar_chamada_visual(
        c,
        chamada,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.855,
        max(18, largura * 0.085),
        largura * 0.92,
        colors.white,
        edicao
    )

    desenhar_nome_visual(
        c,
        nome,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.66,
        max(18, largura * 0.075),
        largura * 0.84,
        colors.HexColor("#171717"),
        edicao
    )

    desenhar_observacao_visual(
        c,
        observacao,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.585,
        max(9, largura * 0.028),
        largura * 0.72,
        colors.HexColor("#666666"),
        edicao
    )

    c.setStrokeColor(colors.HexColor("#c90000"))
    c.setLineWidth(max(1, largura * 0.004))
    c.line(
        x + largura * 0.15,
        y + altura * 0.545,
        x + largura * 0.85,
        y + altura * 0.545
    )

    caixa_y = y + altura * 0.075
    caixa_w = largura * 0.86
    caixa_h = altura * 0.43

    desenhar_bloco_preco(
        c,
        produto,
        centro_x,
        caixa_y + caixa_h * 0.50,
        caixa_w,
        caixa_h,
        colors.HexColor("#c90000"),
        colors.HexColor("#666666"),
        colors.HexColor("#0057B8"),
        edicao,
        placa_x=x,
        placa_y=y,
        placa_largura=largura,
        placa_altura=altura
    )

    c.setFillColor(colors.HexColor("#c90000"))
    c.rect(
        x, y,
        largura, altura * 0.035,
        fill=1, stroke=0
    )


# ============================================================
# LAYOUT 2 — SUPER OFERTA
# ============================================================

def desenhar_layout_oferta(
    c, produto, x, y, largura, altura, edicao=None
):
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    c.setFillColor(colors.white)
    c.rect(x, y, largura, altura, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#ffd400"))
    c.rect(
        x, y + altura * 0.76,
        largura, altura * 0.24,
        fill=1, stroke=0
    )

    c.setFillColor(colors.HexColor("#d90416"))
    c.rect(
        x, y + altura * 0.735,
        largura, altura * 0.025,
        fill=1, stroke=0
    )

    desenhar_chamada_visual(
        c, chamada,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.845,
        max(20, largura * 0.095),
        largura * 0.92,
        colors.HexColor("#171717"),
        edicao
    )

    desenhar_nome_visual(
        c, nome,
        x, y, largura, altura,
        centro_x,
        y + altura * (0.665 + perfil_tamanho_placa(largura, altura)["nome_y"]) - 0.5 * mm,
        max(18, largura * 0.075) * perfil_tamanho_placa(largura, altura)["nome_fator"],
        largura * 0.84,
        colors.HexColor("#171717"),
        edicao
    )

    desenhar_observacao_visual(
        c, observacao,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.585,
        max(10, largura * 0.030),
        largura * 0.74,
        colors.HexColor("#666666"),
        edicao
    )

    c.setStrokeColor(colors.HexColor("#ffd400"))
    c.setLineWidth(max(1, largura * 0.004))
    c.line(
        x + largura * 0.16,
        y + altura * 0.545,
        x + largura * 0.84,
        y + altura * 0.545
    )

    caixa_y = y + altura * 0.115
    caixa_w = largura * 0.88
    caixa_h = altura * 0.42

    desenhar_bloco_preco(
        c, produto,
        centro_x,
        caixa_y + caixa_h * 0.50,
        caixa_w,
        caixa_h,
        colors.HexColor("#d90416"),
        colors.HexColor("#555555"),
        colors.HexColor("#0057B8"),
        edicao,
        placa_x=x,
        placa_y=y,
        placa_largura=largura,
        placa_altura=altura
    )

    c.setFillColor(colors.HexColor("#171717"))
    c.rect(
        x, y,
        largura, altura * 0.08,
        fill=1, stroke=0
    )

    texto_centralizado(
        c,
        "APROVEITE!",
        centro_x,
        y + altura * 0.035,
        "Helvetica-Bold",
        max(10, largura * 0.040),
        colors.white
    )


# ============================================================
# LAYOUT 3 — MODERNO
# ============================================================

def desenhar_layout_moderno(
    c, produto, x, y, largura, altura, edicao=None
):
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    c.setFillColor(colors.HexColor("#f4f7fb"))
    c.rect(x, y, largura, altura, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#0066cc"))
    c.rect(
        x, y + altura * 0.84,
        largura, altura * 0.16,
        fill=1, stroke=0
    )

    c.setFillColor(colors.HexColor("#ff7a00"))
    c.rect(
        x, y + altura * 0.825,
        largura, altura * 0.015,
        fill=1, stroke=0
    )

    desenhar_chamada_visual(
        c, chamada,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.895,
        max(18, largura * 0.085),
        largura * 0.90,
        colors.white,
        edicao
    )

    desenhar_nome_visual(
        c, nome,
        x, y, largura, altura,
        centro_x,
        y + altura * (0.715 + perfil_tamanho_placa(largura, altura)["nome_y"]),
        max(18, largura * 0.078) * perfil_tamanho_placa(largura, altura)["nome_fator"],
        largura * 0.84,
        colors.HexColor("#171717"),
        edicao
    )

    desenhar_observacao_visual(
        c, observacao,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.625,
        max(10, largura * 0.030),
        largura * 0.76,
        colors.HexColor("#667085"),
        edicao
    )

    c.setStrokeColor(colors.HexColor("#d7dee8"))
    c.setLineWidth(max(1, largura * 0.003))
    c.line(
        x + largura * 0.15,
        y + altura * 0.575,
        x + largura * 0.85,
        y + altura * 0.575
    )

    c.setFillColor(colors.HexColor("#ff7a00"))
    c.rect(
        centro_x - largura * 0.07,
        y + altura * 0.568,
        largura * 0.14,
        altura * 0.014,
        fill=1, stroke=0
    )

    # Ajuste fino solicitado: descer o bloco do preço principal em 0,5 mm.
    caixa_y = y + altura * 0.105 - 0.5 * mm
    caixa_w = largura * 0.90
    caixa_h = altura * 0.44

    desenhar_bloco_preco(
        c, produto,
        centro_x,
        caixa_y + caixa_h * 0.50,
        caixa_w,
        caixa_h,
        colors.HexColor("#0066cc"),
        colors.HexColor("#667085"),
        colors.HexColor("#ff7a00"),
        edicao,
        placa_x=x,
        placa_y=y,
        placa_largura=largura,
        placa_altura=altura
    )

    c.setFillColor(colors.HexColor("#ff7a00"))
    c.rect(
        x, y,
        largura, altura * 0.035,
        fill=1, stroke=0
    )


# ============================================================
# LAYOUT 4 — PREMIUM
# ============================================================

def desenhar_layout_premium(
    c, produto, x, y, largura, altura, edicao=None
):
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    c.setFillColor(colors.HexColor("#111827"))
    c.rect(x, y, largura, altura, fill=1, stroke=0)

    c.setStrokeColor(colors.HexColor("#8f7425"))
    c.setLineWidth(max(1, largura * 0.003))
    c.rect(
        x + largura * 0.012,
        y + altura * 0.012,
        largura * 0.976,
        altura * 0.976,
        fill=0, stroke=1
    )

    c.setStrokeColor(colors.HexColor("#d4af37"))
    c.setLineWidth(max(0.8, largura * 0.002))
    c.rect(
        x + largura * 0.025,
        y + altura * 0.025,
        largura * 0.95,
        altura * 0.95,
        fill=0, stroke=1
    )

    c.setFillColor(colors.HexColor("#d4af37"))
    c.rect(
        centro_x - largura * 0.16,
        y + altura * 0.865,
        largura * 0.32,
        altura * 0.008,
        fill=1, stroke=0
    )

    desenhar_chamada_visual(
        c, chamada,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.805,
        max(18, largura * 0.080),
        largura * 0.88,
        colors.HexColor("#d4af37"),
        edicao
    )

    desenhar_nome_visual(
        c, nome,
        x, y, largura, altura,
        centro_x,
        y + altura * (0.675 + perfil_tamanho_placa(largura, altura)["nome_y"]),
        max(18, largura * 0.078) * perfil_tamanho_placa(largura, altura)["nome_fator"],
        largura * 0.82,
        colors.white,
        edicao
    )

    desenhar_observacao_visual(
        c, observacao,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.595,
        max(10, largura * 0.028),
        largura * 0.72,
        colors.HexColor("#c5cad3"),
        edicao
    )

    c.setStrokeColor(colors.HexColor("#4b5563"))
    c.setLineWidth(max(0.8, largura * 0.002))
    c.line(
        x + largura * 0.16,
        y + altura * 0.555,
        x + largura * 0.84,
        y + altura * 0.555
    )

    c.setFillColor(colors.HexColor("#d4af37"))
    c.rect(
        centro_x - largura * 0.055,
        y + altura * 0.548,
        largura * 0.11,
        altura * 0.010,
        fill=1, stroke=0
    )

    caixa_y = y + altura * 0.105
    caixa_w = largura * 0.88
    caixa_h = altura * 0.43

    desenhar_bloco_preco(
        c, produto,
        centro_x,
        caixa_y + caixa_h * 0.50,
        caixa_w,
        caixa_h,
        colors.HexColor("#d4af37"),
        colors.HexColor("#c5cad3"),
        colors.HexColor("#d4af37"),
        edicao,
        placa_x=x,
        placa_y=y,
        placa_largura=largura,
        placa_altura=altura
    )

    c.setFillColor(colors.HexColor("#d4af37"))
    c.rect(
        centro_x - largura * 0.12,
        y + altura * 0.045,
        largura * 0.24,
        altura * 0.008,
        fill=1, stroke=0
    )


# ============================================================
# LAYOUT 5 — IMPACTO
# ============================================================

def desenhar_layout_impacto(
    c, produto, x, y, largura, altura, edicao=None
):
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    c.setFillColor(colors.white)
    c.rect(x, y, largura, altura, fill=1, stroke=0)

    c.setFillColor(colors.HexColor("#d90416"))
    c.rect(
        x, y + altura * 0.75,
        largura, altura * 0.25,
        fill=1, stroke=0
    )

    c.setFillColor(colors.HexColor("#171717"))
    c.rect(
        x, y + altura * 0.725,
        largura, altura * 0.025,
        fill=1, stroke=0
    )

    desenhar_chamada_visual(
        c, chamada,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.845,
        max(20, largura * 0.095),
        largura * 0.92,
        colors.white,
        edicao
    )

    desenhar_nome_visual(
        c, nome,
        x, y, largura, altura,
        centro_x,
        y + altura * (0.665 + perfil_tamanho_placa(largura, altura)["nome_y"]),
        max(18, largura * 0.080) * perfil_tamanho_placa(largura, altura)["nome_fator"],
        largura * 0.84,
        colors.HexColor("#171717"),
        edicao
    )

    desenhar_observacao_visual(
        c, observacao,
        x, y, largura, altura,
        centro_x,
        y + altura * 0.585,
        max(10, largura * 0.030),
        largura * 0.76,
        colors.HexColor("#555555"),
        edicao
    )

    c.setStrokeColor(colors.HexColor("#d90416"))
    c.setLineWidth(max(1.5, largura * 0.005))
    c.line(
        x + largura * 0.12,
        y + altura * 0.545,
        x + largura * 0.88,
        y + altura * 0.545
    )

    caixa_y = y + altura * 0.105
    caixa_w = largura * 0.90
    caixa_h = altura * 0.44

    desenhar_bloco_preco(
        c, produto,
        centro_x,
        caixa_y + caixa_h * 0.50,
        caixa_w,
        caixa_h,
        colors.HexColor("#d90416"),
        colors.HexColor("#555555"),
        colors.HexColor("#ffd400"),
        edicao,
        placa_x=x,
        placa_y=y,
        placa_largura=largura,
        placa_altura=altura
    )

    c.setFillColor(colors.HexColor("#171717"))
    c.rect(
        x, y,
        largura, altura * 0.075,
        fill=1, stroke=0
    )

    texto_centralizado(
        c,
        "APROVEITE!",
        centro_x,
        y + altura * 0.030,
        "Helvetica-Bold",
        max(10, largura * 0.042),
        colors.white
    )

    c.setFillColor(colors.HexColor("#ffd400"))

    c.rect(
        x + largura * 0.08,
        y + altura * 0.075,
        largura * 0.16,
        altura * 0.012,
        fill=1, stroke=0
    )

    c.rect(
        x + largura * 0.76,
        y + altura * 0.075,
        largura * 0.16,
        altura * 0.012,
        fill=1, stroke=0
    )



# ============================================================
# LAYOUTS 6 A 10 — NOVOS MODELOS
# ============================================================

def _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, estilo):
    """Modelos adicionais sem alterar os cinco modelos originais."""
    nome = produto.get("nome", "").strip()
    chamada = obter_chamada(produto)
    observacao = produto.get("observacao", "").strip()
    centro_x = x + largura / 2

    estilos = {
        "atacado": {"fundo":"#ffffff", "topo":"#0057b8", "acento":"#ff8a00", "preco":"#0057b8", "texto":"#171717", "rodape":"#0057b8", "chamada":"#ffffff"},
        "economico": {"fundo":"#ffffff", "topo":"#159447", "acento":"#ffd400", "preco":"#159447", "texto":"#202020", "rodape":"#202020", "chamada":"#ffffff"},
        "supermercado": {"fundo":"#fffdf7", "topo":"#e85d04", "acento":"#ffd166", "preco":"#d90416", "texto":"#202020", "rodape":"#d90416", "chamada":"#ffffff"},
        "oferta_vermelha": {"fundo":"#ffffff", "topo":"#d90416", "acento":"#171717", "preco":"#d90416", "texto":"#171717", "rodape":"#171717", "chamada":"#ffffff"},
        "destaque": {"fundo":"#f4f8ff", "topo":"#003f7f", "acento":"#0066cc", "preco":"#d90416", "texto":"#17324d", "rodape":"#003f7f", "chamada":"#ffffff"},
    }
    e = estilos.get(estilo, estilos["atacado"])
    cor = lambda h: colors.HexColor(h)

    c.setFillColor(cor(e["fundo"]))
    c.rect(x, y, largura, altura, fill=1, stroke=0)
    c.setFillColor(cor(e["topo"]))
    c.rect(x, y + altura * 0.77, largura, altura * 0.23, fill=1, stroke=0)
    c.setFillColor(cor(e["acento"]))
    c.rect(x, y + altura * 0.735, largura, altura * 0.035, fill=1, stroke=0)

    desenhar_chamada_visual(c, chamada, x, y, largura, altura, centro_x,
                            y + altura * 0.845, max(18, largura * 0.085), largura * 0.92,
                            cor(e["chamada"]), edicao)

    nome_y = 0.665 if estilo != "destaque" else 0.69
    nome_fator = 1.08 if estilo in ("atacado", "destaque") else 1.0
    desenhar_nome_visual(c, nome, x, y, largura, altura, centro_x,
                         y + altura * nome_y, max(18, largura * 0.075) * nome_fator,
                         largura * 0.86, cor(e["texto"]), edicao)

    desenhar_observacao_visual(c, observacao, x, y, largura, altura, centro_x,
                               y + altura * 0.585, max(9, largura * 0.028),
                               largura * 0.72, colors.HexColor("#666666"), edicao)

    c.setStrokeColor(cor(e["acento"]))
    c.setLineWidth(max(1, largura * 0.004))
    c.line(x + largura * 0.14, y + altura * 0.545,
           x + largura * 0.86, y + altura * 0.545)

    caixa_y = y + altura * 0.075
    caixa_w = largura * 0.88
    caixa_h = altura * 0.43
    desenhar_bloco_preco(c, produto, centro_x, caixa_y + caixa_h * 0.50,
                         caixa_w, caixa_h, cor(e["preco"]), colors.HexColor("#666666"),
                         cor(e["acento"]), edicao, placa_x=x, placa_y=y,
                         placa_largura=largura, placa_altura=altura)

    c.setFillColor(cor(e["rodape"]))
    c.rect(x, y, largura, altura * 0.055, fill=1, stroke=0)
    texto_centralizado(c, "APROVEITE!", centro_x, y + altura * 0.018,
                       "Helvetica-Bold", max(9, largura * 0.032), colors.white)


def desenhar_layout_atacado(c, produto, x, y, largura, altura, edicao=None):
    _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, "atacado")

def desenhar_layout_economico(c, produto, x, y, largura, altura, edicao=None):
    _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, "economico")

def desenhar_layout_supermercado(c, produto, x, y, largura, altura, edicao=None):
    _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, "supermercado")

def desenhar_layout_oferta_vermelha(c, produto, x, y, largura, altura, edicao=None):
    _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, "oferta_vermelha")

def desenhar_layout_destaque(c, produto, x, y, largura, altura, edicao=None):
    _desenhar_layout_extra(c, produto, x, y, largura, altura, edicao, "destaque")


# ============================================================
# SELEÇÃO DO LAYOUT
# ============================================================

def desenhar_placa(
    c,
    x,
    y,
    largura,
    altura,
    produto,
    layout="classico",
    edicao=None
):
    if layout == "oferta":
        desenhar_layout_oferta(
            c, produto, x, y, largura, altura, edicao
        )

    elif layout == "moderno":
        desenhar_layout_moderno(
            c, produto, x, y, largura, altura, edicao
        )

    elif layout == "premium":
        desenhar_layout_premium(
            c, produto, x, y, largura, altura, edicao
        )

    elif layout == "impacto":
        desenhar_layout_impacto(
            c, produto, x, y, largura, altura, edicao
        )

    elif layout == "atacado":
        desenhar_layout_atacado(c, produto, x, y, largura, altura, edicao)

    elif layout == "economico":
        desenhar_layout_economico(c, produto, x, y, largura, altura, edicao)

    elif layout == "supermercado":
        desenhar_layout_supermercado(c, produto, x, y, largura, altura, edicao)

    elif layout == "oferta_vermelha":
        desenhar_layout_oferta_vermelha(c, produto, x, y, largura, altura, edicao)

    elif layout == "destaque":
        desenhar_layout_destaque(c, produto, x, y, largura, altura, edicao)

    else:
        desenhar_layout_classico(
            c, produto, x, y, largura, altura, edicao
        )


# ============================================================
# LINHAS DE CORTE
# ============================================================

def linha_tracejada(c, x1, y1, x2, y2):
    c.saveState()

    c.setDash(4, 3)
    c.setStrokeColorRGB(
        0.55,
        0.55,
        0.55
    )

    c.setLineWidth(0.6)

    c.line(
        x1, y1,
        x2, y2
    )

    c.restoreState()


# ============================================================
# MARCA DE ALINHAMENTO
# ============================================================

def marca_alinhamento(c, x, y):
    tam = 5 * mm

    c.saveState()

    c.setStrokeColor(colors.black)
    c.setLineWidth(0.6)

    c.line(
        x - tam, y,
        x + tam, y
    )

    c.line(
        x, y - tam,
        x, y + tam
    )

    c.restoreState()


# ============================================================
# COMPATIBILIDADE / LOG DA EDIÇÃO
# ============================================================

def aplicar_edicao_visual(
    c,
    edicao,
    x,
    y,
    largura,
    altura
):
    """
    As edições agora são aplicadas diretamente por cada elemento
    durante o desenho da placa.

    Esta função fica apenas para compatibilidade e diagnóstico.
    Ela NÃO desenha os elementos novamente, evitando duplicação.
    """
    if not edicao:
        return

    elementos = edicao.get("elementos", {})

    if not elementos:
        return

    print("EDIÇÃO VISUAL RECEBIDA:")
    print(edicao)

    for nome, item in elementos.items():
        if not item.get("visivel", True):
            continue

        x_percent = float(
            item.get("xPercent", 0) or 0
        )

        y_percent = float(
            item.get("yPercent", 0) or 0
        )

        pos_x = (
            x
            + x_percent / 100 * largura
        )

        pos_y = (
            y
            + altura
            - y_percent / 100 * altura
        )

        print(
            f"Elemento: {nome} | "
            f"X: {pos_x:.2f} | "
            f"Y: {pos_y:.2f} | "
            f"Fonte: {item.get('fontSize')}"
        )


# ============================================================
# GERAÇÃO DO PDF
# ============================================================

def criar_pdf(dados):
    produtos = dados.get("produtos", [])
    tamanho = dados.get("tamanho", "G")
    layout = dados.get("layout", "classico")
    edicao = dados.get("edicao")

    buffer = io.BytesIO()

    c = canvas.Canvas(
        buffer,
        pagesize=A4
    )

    largura_pagina, altura_pagina = A4

    # ========================================================
    # P — 9 PLACAS POR A4
    # ========================================================

    if tamanho == "P":
        cols = 3
        rows = 3

        cel_largura = largura_pagina / cols
        cel_altura = altura_pagina / rows

        posicoes = [
            (
                col * cel_largura,
                row * cel_altura
            )
            for row in range(rows)
            for col in range(cols)
        ]

        for i, produto in enumerate(produtos[:9]):
            x, y = posicoes[i]

            # Cada placa do P recebe sua própria edição visual.
            if isinstance(edicao, dict) and isinstance(edicao.get("placas"), list):
                edicao_produto = edicao["placas"][i] if i < len(edicao["placas"]) else None
            else:
                edicao_produto = edicao if i == 0 else None

            desenhar_placa(
                c,
                x, y,
                cel_largura,
                cel_altura,
                produto,
                layout,
                edicao_produto
            )

        for col in range(1, cols):
            linha_tracejada(
                c,
                col * cel_largura,
                0,
                col * cel_largura,
                altura_pagina
            )

        for row in range(1, rows):
            linha_tracejada(
                c,
                0,
                row * cel_altura,
                largura_pagina,
                row * cel_altura
            )

        c.showPage()

    # ========================================================
    # M — 2 PLACAS POR A4
    # ========================================================

    elif tamanho == "M":
        cel_largura = largura_pagina
        cel_altura = altura_pagina / 2

        posicoes = [
            (0, cel_altura),
            (0, 0)
        ]

        for i, produto in enumerate(produtos[:2]):
            x, y = posicoes[i]

            # Cada placa do M recebe sua própria edição visual.
            if isinstance(edicao, dict) and isinstance(edicao.get("placas"), list):
                edicao_produto = edicao["placas"][i] if i < len(edicao["placas"]) else None
            else:
                edicao_produto = edicao if i == 0 else None

            desenhar_placa(
                c,
                x, y,
                cel_largura,
                cel_altura,
                produto,
                layout,
                edicao_produto
            )

        if len(produtos) == 2:
            linha_tracejada(
                c,
                0,
                cel_altura,
                largura_pagina,
                cel_altura
            )

        c.showPage()

    # ========================================================
    # G — 1 PLACA POR A4
    # ========================================================

    elif tamanho == "G":
        # G = uma placa inteira por página. Vários produtos podem ser
        # adicionados; cada produto ocupa sua própria página A4.
        lista_g = produtos[:20] if produtos else [{}]
        for i, produto in enumerate(lista_g):
            edicao_produto = None
            if isinstance(edicao, dict) and isinstance(edicao.get("placas"), list):
                edicao_produto = edicao["placas"][i] if i < len(edicao["placas"]) else None
            elif i == 0:
                edicao_produto = edicao

            desenhar_placa(
                c, 0, 0, largura_pagina, altura_pagina,
                produto, layout, edicao_produto
            )
            c.showPage()

    # ========================================================
    # GG — 2 A4 HORIZONTAIS / LADO A LADO
    # ========================================================

    elif tamanho == "GG":
        produto = produtos[0] if produtos else {}

        largura_a4 = altura_pagina
        altura_a4 = largura_pagina

        largura_total = largura_a4
        altura_total = altura_a4 * 2

        c.setPageSize(
            (
                largura_a4,
                altura_a4
            )
        )

        def desenhar_arte_gg():
            c.setFillColor(colors.white)

            c.rect(
                0, 0,
                largura_total,
                altura_total,
                fill=1,
                stroke=0
            )

            desenhar_placa(
                c,
                0, 0,
                largura_total,
                altura_total,
                produto,
                layout,
                edicao
            )

        c.saveState()
        c.translate(0, -altura_a4)
        desenhar_arte_gg()
        c.restoreState()
        c.showPage()

        c.saveState()
        desenhar_arte_gg()
        c.restoreState()
        c.showPage()

    # ========================================================
    # XG — 4 A4
    # ========================================================

    elif tamanho == "XG":
        produto = produtos[0] if produtos else {}

        largura_a4 = largura_pagina
        altura_a4 = altura_pagina

        largura_total = largura_a4 * 2
        altura_total = altura_a4 * 2

        c.setPageSize(A4)

        def desenhar_arte_xg():
            c.setFillColor(colors.white)

            c.rect(
                0, 0,
                largura_total,
                altura_total,
                fill=1,
                stroke=0
            )

            desenhar_placa(
                c,
                0, 0,
                largura_total,
                altura_total,
                produto,
                layout,
                edicao
            )

        c.saveState()
        c.translate(0, -altura_a4)
        desenhar_arte_xg()
        c.restoreState()
        c.showPage()

        c.saveState()
        c.translate(-largura_a4, -altura_a4)
        desenhar_arte_xg()
        c.restoreState()
        c.showPage()

        c.saveState()
        desenhar_arte_xg()
        c.restoreState()
        c.showPage()

        c.saveState()
        c.translate(-largura_a4, 0)
        desenhar_arte_xg()
        c.restoreState()
        c.showPage()

    # ========================================================
    # FALLBACK
    # ========================================================

    else:
        if produtos:
            desenhar_placa(
                c,
                0, 0,
                largura_pagina,
                altura_pagina,
                produtos[0],
                layout,
                edicao
            )

        c.showPage()

    c.save()

    buffer.seek(0)

    return buffer.getvalue()


# ============================================================
# LAYOUTS DO CLIENTE
# ============================================================
@app.route("/api/layouts", methods=["GET"])
def listar_layouts():
    try:
        token,_,acesso=_contexto_cliente(); params={"select":"id,nome,descricao,tamanho,layout_base,edicao,created_at,updated_at","cliente_id":f"eq.{acesso['cliente_id']}","order":"updated_at.desc"}
        r=_rest("GET","/rest/v1/cartazeamento_layouts",token,params=params)
        if not r.ok:return jsonify({"erro":"Não foi possível carregar os layouts."}),r.status_code
        return jsonify(r.json())
    except PermissionError as e:return _erro_auth(e)
    except Exception as e: print("ERRO layouts GET:",e); return jsonify({"erro":"Não foi possível carregar os layouts."}),500

@app.route("/api/layouts", methods=["POST"])
def criar_layout():
    try:
        token,user,acesso=_contexto_cliente(); d=request.get_json() or {}; nome=str(d.get("nome") or "").strip()
        if not nome:return jsonify({"erro":"Informe um nome para o layout."}),400
        payload={"cliente_id":acesso["cliente_id"],"created_by":user.get("id"),"nome":nome,"descricao":str(d.get("descricao") or ""),"tamanho":str(d.get("tamanho") or "G"),"layout_base":str(d.get("layout_base") or d.get("layout") or "classico"),"edicao":d.get("edicao") or {}}
        r=_rest("POST","/rest/v1/cartazeamento_layouts",token,json=payload,headers={"Prefer":"return=representation"})
        if not r.ok:return jsonify({"erro":"Não foi possível salvar o layout."}),r.status_code
        x=r.json(); return jsonify(x[0] if isinstance(x,list) and x else x),201
    except PermissionError as e:return _erro_auth(e)
    except Exception as e: print("ERRO layouts POST:",e); return jsonify({"erro":"Não foi possível salvar o layout."}),500

@app.route("/api/layouts/<layout_id>", methods=["PUT","DELETE"])
def alterar_layout(layout_id):
    try:
        token,_,acesso=_contexto_cliente(); filtro={"id":f"eq.{layout_id}","cliente_id":f"eq.{acesso['cliente_id']}"}
        if request.method=="DELETE":
            r=_rest("DELETE","/rest/v1/cartazeamento_layouts",token,params=filtro)
            return (jsonify({"ok":True}),200) if r.ok else (jsonify({"erro":"Não foi possível excluir o layout."}),r.status_code)
        d=request.get_json() or {}; payload={k:d[k] for k in ("nome","descricao","tamanho","layout_base","edicao") if k in d}
        if "nome" in payload: payload["nome"]=str(payload["nome"] or "").strip()
        r=_rest("PATCH","/rest/v1/cartazeamento_layouts",token,params=filtro,json=payload,headers={"Prefer":"return=representation"})
        if not r.ok:return jsonify({"erro":"Não foi possível atualizar o layout."}),r.status_code
        x=r.json(); return jsonify(x[0] if isinstance(x,list) and x else x)
    except PermissionError as e:return _erro_auth(e)
    except Exception as e: print("ERRO layouts ALTER:",e); return jsonify({"erro":"Não foi possível alterar o layout."}),500

# ============================================================
# ROTA — GERAR PDF FINAL
# ============================================================

@app.route("/gerar-pdf", methods=["POST"])
def gerar_pdf():
    try:
        _contexto_cliente(); dados=request.get_json() or {}; pdf_bytes=criar_pdf(dados)

        return send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=False,
            download_name="placas_final.pdf"
        )

    except PermissionError as erro: return _erro_auth(erro)
    except Exception as erro:
        print("ERRO AO GERAR PDF:",erro); return jsonify({"erro":"Não foi possível gerar o PDF."}),500


# ============================================================
# ROTA — IMPRIMIR
# ============================================================

@app.route("/imprimir-pdf", methods=["POST"])
def imprimir_pdf():
    """
    Retorna o mesmo PDF em modo inline, preparado para ser
    aberto pelo navegador e enviado para a impressão.
    """
    try:
        _contexto_cliente(); dados=request.get_json() or {}; pdf_bytes=criar_pdf(dados)

        resposta = send_file(
            io.BytesIO(pdf_bytes),
            mimetype="application/pdf",
            as_attachment=False,
            download_name="placas_para_impressao.pdf"
        )

        return resposta

    except PermissionError as erro: return _erro_auth(erro)
    except Exception as erro:
        print("ERRO AO PREPARAR IMPRESSÃO:",erro); return jsonify({"erro":"Não foi possível preparar a impressão."}),500


# ============================================================
# ROTA — GERAR PRÉVIA
# ============================================================

@app.route("/gerar-preview", methods=["POST"])
def gerar_preview():
    try:
        _contexto_cliente(); dados=request.get_json() or {}; pdf_bytes=criar_pdf(dados)

        documento = pymupdf.open(stream=pdf_bytes, filetype="pdf")
        if documento.page_count == 0:
            documento.close()
            return jsonify({"erro": "O PDF não possui páginas."}), 500

        # Renderiza todas as páginas. GG mostra 2 páginas e XG mostra as 4.
        escala = 1.55
        paginas = []
        for numero, pagina in enumerate(documento):
            pix = pagina.get_pixmap(matrix=pymupdf.Matrix(escala, escala), alpha=False)
            png = pix.tobytes("png")
            paginas.append((numero + 1, pix.width, pix.height, base64.b64encode(png).decode("ascii")))
        documento.close()

        margem = 24
        gap = 18
        label_h = 28
        count = len(paginas)
        if count == 1:
            colunas = 1
        elif count == 2:
            colunas = 1
        else:
            colunas = 2
        linhas = (count + colunas - 1) // colunas
        larguras = []
        for _,w,h,_ in paginas: larguras.append(w)
        cel_w = max(larguras)
        cel_h = max(p[2] for p in paginas)
        svg_w = margem*2 + colunas*cel_w + (colunas-1)*gap
        svg_h = margem*2 + linhas*(cel_h+label_h) + (linhas-1)*gap

        partes=[f'<svg xmlns="http://www.w3.org/2000/svg" width="{svg_w}" height="{svg_h}" viewBox="0 0 {svg_w} {svg_h}">',
                f'<rect width="100%" height="100%" fill="#e9eef4"/>']
        for idx,(numero,w,h,b64) in enumerate(paginas):
            col=idx%colunas; row=idx//colunas
            x=margem+col*(cel_w+gap)+(cel_w-w)/2
            y=margem+row*(cel_h+label_h+gap)+label_h
            partes.append(f'<rect x="{x-1:.1f}" y="{y-1:.1f}" width="{w+2}" height="{h+2}" rx="2" fill="#ffffff" stroke="#d8dee6"/>')
            partes.append(f'<text x="{margem+col*(cel_w+gap)+cel_w/2:.1f}" y="{margem+row*(cel_h+label_h+gap)+18:.1f}" text-anchor="middle" font-family="Arial" font-size="13" font-weight="700" fill="#536273">Página {numero} de {count}</text>')
            partes.append(f'<image href="data:image/png;base64,{b64}" x="{x:.1f}" y="{y:.1f}" width="{w}" height="{h}" preserveAspectRatio="none"/>')
        partes.append('</svg>')
        return app.response_class("".join(partes), mimetype="image/svg+xml")

    except PermissionError as erro: return _erro_auth(erro)
    except Exception as erro:
        print("ERRO AO GERAR PRÉVIA:",erro); return jsonify({"erro":"Não foi possível gerar a prévia."}),500


# ============================================================
# EXECUÇÃO
# ============================================================

if __name__ == "__main__":
    port=int(os.environ.get("PORT","5000")); app.run(host="0.0.0.0",port=port,debug=False)
