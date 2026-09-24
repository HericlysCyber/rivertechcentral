const express = require("express");
const cors = require("cors");
const path = require("path");

const app = express();
const PORT = Number(process.env.PORT || 3000);

app.use(cors());
app.use(express.json());

// A Central e o River Music compartilham o mesmo serviço Node.
const CENTRAL_DIR = path.join(__dirname, "..", "Central");
app.use(express.static(CENTRAL_DIR));

const SUPABASE_URL = (process.env.SUPABASE_URL || "https://vdocjqaskeucnrqdobyb.supabase.co").replace(/\/$/, "");
const SUPABASE_KEY = process.env.SUPABASE_KEY || "sb_publishable_A87wjQ82Uw6_CCmKg9TsQw_ruSBqSPF";

async function verificarAcessoRiverMusic(req, res, next) {
    try {
        const authorization = req.headers.authorization || "";
        if (!/^Bearer\s+/i.test(authorization)) {
            return res.status(401).json({ sucesso:false, erro:"Sessão não enviada." });
        }

        const userResponse = await fetch(`${SUPABASE_URL}/auth/v1/user`, {
            headers: { apikey: SUPABASE_KEY, Authorization: authorization }
        });
        if (!userResponse.ok) {
            return res.status(401).json({ sucesso:false, erro:"Sessão inválida ou expirada." });
        }

        const rpcResponse = await fetch(`${SUPABASE_URL}/rest/v1/rpc/verificar_acesso_cliente`, {
            method: "POST",
            headers: {
                apikey: SUPABASE_KEY,
                Authorization: authorization,
                "Content-Type": "application/json"
            },
            body: "{}"
        });
        const rpcData = await rpcResponse.json();
        const acesso = Array.isArray(rpcData) ? rpcData[0] : rpcData;
        if (!rpcResponse.ok || !acesso?.permitido) {
            return res.status(403).json({ sucesso:false, erro: acesso?.motivo || "Acesso ao River Music bloqueado." });
        }

        const modResponse = await fetch(`${SUPABASE_URL}/rest/v1/modulos?select=id&slug=eq.river-music&ativo=eq.true&limit=1`, {
            headers: { apikey: SUPABASE_KEY, Authorization: authorization }
        });
        const mods = await modResponse.json();
        const mod = Array.isArray(mods) ? mods[0] : null;

        const permResponse = await fetch(`${SUPABASE_URL}/rest/v1/cliente_modulos?select=modulo_id,ativo&cliente_id=eq.${encodeURIComponent(acesso.cliente_id)}&ativo=eq.true`, {
            headers: { apikey: SUPABASE_KEY, Authorization: authorization }
        });
        const perms = await permResponse.json();
        if (!mod || !Array.isArray(perms) || !perms.some(p => p.modulo_id === mod.id && p.ativo === true)) {
            return res.status(403).json({ sucesso:false, erro:"River Music não está liberado para esta conta." });
        }

        req.riverMusicAccess = acesso;
        next();
    } catch (error) {
        console.error("❌ Falha na validação do River Music:", error);
        return res.status(500).json({ sucesso:false, erro:"Não foi possível validar o acesso ao River Music." });
    }
}


// =====================================================
// CONFIGURAÇÕES
// =====================================================

const TEMPO_LIMITE = 10000; // 10 segundos

// =====================================================
// JAMENDO
// =====================================================

const JAMENDO_CLIENT_ID = "709fa152";

// =====================================================
// LIMPAR HTML DOS METADADOS
// =====================================================

function limparHTML(texto = "") {

    if (!texto) {
        return "";
    }

    return texto
        .replace(/<[^>]*>/g, " ")
        .replace(/&amp;/g, "&")
        .replace(/&quot;/g, '"')
        .replace(/&#39;/g, "'")
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/\s+/g, " ")
        .trim();
}

// =====================================================
// FETCH COM TIMEOUT
// =====================================================

async function buscarComTimeout(url, opcoes = {}) {

    const controller = new AbortController();

    const timeout = setTimeout(() => {
        controller.abort();
    }, TEMPO_LIMITE);

    try {

        const resposta = await fetch(url, {
            ...opcoes,
            signal: controller.signal
        });

        return resposta;

    } finally {

        clearTimeout(timeout);

    }
}

// =====================================================
// FILTRO DE RESULTADOS MUSICAIS
// =====================================================

function pareceMusica(resultado) {

    const texto = [
        resultado.titulo || "",
        resultado.artista || "",
        resultado.descricao || "",
        resultado.categoria || ""
    ]
        .join(" ")
        .toLowerCase();

    // Termos que normalmente indicam gravação de fala,
    // pronúncia, aula, entrevista ou conteúdo linguístico.
    const termosNaoMusicais = [
        "speaker",
        "recorder",
        "pronunciation",
        "pronúncia",
        "word",
        "palavra",
        "vocabulary",
        "vocabulário",
        "language",
        "língua",
        "linguistic",
        "linguística",
        "interview",
        "entrevista",
        "speech",
        "fala",
        "lesson",
        "aula",
        "voice",
        "voz",
        "dialogue",
        "diálogo"
    ];

    for (const termo of termosNaoMusicais) {
        if (texto.includes(termo)) {
            return false;
        }
    }

    return true;
}

// =====================================================
// CLASSIFICADOR DE LICENÇA — RÁDIO
// =====================================================

function classificarLicenca(licenca = "", urlLicenca = "") {

    const texto =
        `${licenca} ${urlLicenca}`.toLowerCase();


    // ================================================
    // CC0 / DOMÍNIO PÚBLICO
    // ================================================

    if (
        texto.includes("cc0") ||
        texto.includes("public domain") ||
        texto.includes("publicdomain")
    ) {

        return {

            classificacao:
                "🟢 USO COMERCIAL PERMITIDO",

            comercial: true,

            tipoLicenca:
                "Domínio público / CC0",

            condicoes:
                "Uso comercial permitido. Não exige atribuição pela licença CC0."

        };

    }


    // ================================================
    // CREATIVE COMMONS — SEM USO COMERCIAL
    // ================================================

    if (
        texto.includes("by-nc") ||
        texto.includes("by-nc-sa") ||
        texto.includes("by-nc-nd") ||
        texto.includes("noncommercial")
    ) {

        return {

            classificacao:
                "🔴 USO COMERCIAL NÃO PERMITIDO",

            comercial: false,

            tipoLicenca:
                "Creative Commons com restrição comercial",

            condicoes:
                "A licença proíbe o uso comercial."

        };

    }


    // ================================================
    // CREATIVE COMMONS BY-ND
    // ================================================

    if (
        texto.includes("by-nd")
    ) {

        return {

            classificacao:
                "🟡 USO PERMITIDO COM CONDIÇÕES",

            comercial: true,

            tipoLicenca:
                "Creative Commons BY-ND",

            condicoes:
                "Uso comercial permitido para a obra sem alterações, com atribuição."

        };

    }


    // ================================================
    // CREATIVE COMMONS BY-SA
    // ================================================

    if (
        texto.includes("by-sa")
    ) {

        return {

            classificacao:
                "🟡 USO PERMITIDO COM CONDIÇÕES",

            comercial: true,

            tipoLicenca:
                "Creative Commons BY-SA",

            condicoes:
                "Uso comercial permitido com atribuição. Derivações devem manter a mesma licença."

        };

    }


    // ================================================
    // CREATIVE COMMONS BY
    // ================================================

    if (
        texto.includes("cc by") ||
        texto.includes("by 4.0") ||
        texto.includes("by 3.0")
    ) {

        return {

            classificacao:
                "🟡 USO PERMITIDO COM CONDIÇÕES",

            comercial: true,

            tipoLicenca:
                "Creative Commons BY",

            condicoes:
                "Uso comercial permitido com atribuição ao autor."

        };

    }


    // ================================================
    // ROYALTY-FREE / LICENÇA COMERCIAL
    // ================================================

    if (
        texto.includes("royalty-free") ||
        texto.includes("royalty free") ||
        texto.includes("commercial license")
    ) {

        return {

            classificacao:
                "🟢 USO COMERCIAL PERMITIDO",

            comercial: true,

            tipoLicenca:
                "Licença comercial / royalty-free",

            condicoes:
                "Verificar os termos específicos da licença na fonte original."

        };

    }


    // ================================================
    // LICENÇA DESCONHECIDA
    // ================================================

    return {

        classificacao:
            "⚪ LICENÇA NÃO CONFIRMADA",

        comercial: false,

        tipoLicenca:
            "Licença desconhecida",

        condicoes:
            "A licença precisa ser verificada na fonte original antes do uso."

    };

}


// =====================================================
// FONTE 1 — OPENVERSE
// =====================================================

async function pesquisarOpenverse(busca) {

    const url =
        "https://api.openverse.org/v1/audio/?" +
        new URLSearchParams({
            q: busca,
            page_size: "20"
        });

    console.log(`🔎 Openverse: ${busca}`);

    try {

        const resposta = await buscarComTimeout(url);

        if (!resposta.ok) {

            throw new Error(
                `Openverse respondeu com status ${resposta.status}`
            );

        }

        const dados = await resposta.json();

        const resultados = (dados.results || []).map(musica => {

            const licenca = musica.license || "desconhecida";

            const classificacao =
                classificarLicenca(
                    licenca,
                    musica.license_url || ""
                );

            return {

                id: `openverse-${musica.id}`,

                titulo: musica.title || "Título desconhecido",

                artista:
                    musica.creator ||
                    "Artista desconhecido",

                album:
                    musica.album ||
                    "",

                fonte:
                    musica.provider ||
                    musica.source ||
                    "Openverse",

                origem:
                    musica.foreign_landing_url ||
                    "",

                arquivo:
                    musica.url ||
                    "",

                licenca,

                versaoLicenca:
                    musica.license_version ||
                    "",

                urlLicenca:
                    musica.license_url ||
                    "",

                atribuicao:
                    musica.attribution ||
                    "",

                duracao:
                    musica.duration ||
                    null,

                tipoArquivo:
                    musica.filetype ||
                    "",

                tamanho:
                    musica.filesize ||
                    null,

                classificacao:
                    classificacao.classificacao,

                comercial:
                    classificacao.comercial,

                condicoes:
                    classificacao.condicoes,

                origemFonte: "Openverse"

            };

        });

        return resultados;

    } catch (erro) {

        console.log(
            `⚠️ Openverse indisponível: ${erro.message}`
        );

        return [];

    }

}


// =====================================================
// FONTE 2 — WIKIMEDIA COMMONS
// =====================================================

async function pesquisarWikimedia(busca) {

    console.log(`🔎 Wikimedia Commons: ${busca}`);

    try {

        const parametros = new URLSearchParams({

            action: "query",

            format: "json",

            generator: "search",

            gsrsearch: `${busca} filetype:audio`,

            gsrnamespace: "6",

            gsrlimit: "20",

            prop: "imageinfo",

            iiprop:
                "url|size|mime|mediatype|extmetadata",

            iiextmetadatafilter:
                "Artist|LicenseShortName|LicenseUrl|UsageTerms|Attribution|AttributionRequired|ObjectName"

        });


        const url =
            "https://commons.wikimedia.org/w/api.php?" +
            parametros.toString();


        const resposta = await buscarComTimeout(url, {

            headers: {

                "User-Agent":
                    "RiverMusic/1.0 (River Tech)"

            }

        });


        if (!resposta.ok) {

            throw new Error(
                `Wikimedia respondeu com status ${resposta.status}`
            );

        }


        const dados = await resposta.json();


        const paginas =
            dados.query?.pages ||
            {};


        const resultados = [];


        for (const chave of Object.keys(paginas)) {

            const pagina = paginas[chave];

            const info =
                pagina.imageinfo?.[0];


            if (!info) {

                continue;

            }


            // Garantir que estamos trabalhando com áudio
            if (
                info.mediatype &&
                info.mediatype !== "AUDIO"
            ) {

                continue;

            }


            const meta =
                info.extmetadata ||
                {};


            const pegarMeta = nome => {

                return meta[nome]?.value || "";

            };


            const titulo =
    limparHTML(
        pegarMeta("ObjectName")
    ) ||
    pagina.title.replace(/^File:/, "");


            const artista =
    limparHTML(
        pegarMeta("Artist")
    ) ||
    "Artista desconhecido";


            const licenca =
                pegarMeta("LicenseShortName") ||
                pegarMeta("UsageTerms") ||
                "desconhecida";


            const urlLicenca =
                pegarMeta("LicenseUrl");


            const atribuicao =
    limparHTML(
        pegarMeta("Attribution")
    ) ||
    artista;


            const classificacao =
                classificarLicenca(
                    licenca,
                    urlLicenca
                );


            resultados.push({

                id:
                    `wikimedia-${pagina.pageid}`,

                titulo,

                artista,

                album: "",

                fonte:
                    "Wikimedia Commons",

                origem:
                    `https://commons.wikimedia.org/wiki/${encodeURIComponent(
                        pagina.title.replace(/ /g, "_")
                    )}`,

                arquivo:
                    info.url || "",

                licenca,

                versaoLicenca: "",

                urlLicenca,

                atribuicao,

                duracao: null,

                tipoArquivo:
                    info.mime || "",

                tamanho:
                    info.size || null,

                classificacao:
                    classificacao.classificacao,

                comercial:
                    classificacao.comercial,

                condicoes:
    classificacao.condicoes,

tipoLicenca:
    classificacao.tipoLicenca,

tipoUso:
    "radio",

origemFonte:
    "Wikimedia Commons"

            });

        }


        return resultados;


    } catch (erro) {

        console.log(
            `⚠️ Wikimedia indisponível: ${erro.message}`
        );

        return [];

    }

}

// =====================================================
// FONTE 3 — JAMENDO
// =====================================================

async function pesquisarJamendo(busca) {

    console.log(`🔎 Jamendo: ${busca}`);

    try {

        const parametros = new URLSearchParams({

            client_id: JAMENDO_CLIENT_ID,

            format: "json",

            limit: "20",

            search: busca,

            audioformat: "mp32",

            audiodlformat: "mp32",

            type: "single albumtrack"

        });


        const url =
            "https://api.jamendo.com/v3.0/tracks/?" +
            parametros.toString();


        const resposta =
            await buscarComTimeout(url);


        if (!resposta.ok) {

            throw new Error(
                `Jamendo respondeu com status ${resposta.status}`
            );

        }


        const dados =
            await resposta.json();


        if (
            dados.headers &&
            dados.headers.status !== "success"
        ) {

            throw new Error(
                dados.headers.error_message ||
                "Erro desconhecido na API do Jamendo"
            );

        }


        const resultados =
            (dados.results || []).map(musica => {

                const licenca =
                    musica.license_ccurl ||
                    "Licença Jamendo";


                /*
                 * IMPORTANTE:
                 * A licença Creative Commons da faixa
                 * é analisada pelo nosso classificador.
                 *
                 * Isso NÃO significa automaticamente
                 * que uma faixa está liberada para rádio.
                 */

                const classificacao =
                    classificarLicenca(
                        licenca,
                        musica.license_ccurl || ""
                    );


                return {

                    id:
                        `jamendo-${musica.id}`,

                    titulo:
                        musica.name ||
                        "Título desconhecido",

                    artista:
                        musica.artist_name ||
                        "Artista desconhecido",

                    album:
                        musica.album_name ||
                        "",

                    fonte:
                        "Jamendo",

                    origem:
                        musica.shareurl ||
                        `https://www.jamendo.com/track/${musica.id}`,

                    arquivo:
                        musica.audio ||
                        "",

                    download:
                        musica.audiodownload ||
                        "",

                    downloadPermitido:
                        musica.audiodownload_allowed === true,

                    licenca,

                    versaoLicenca: "",

                    urlLicenca:
                        musica.license_ccurl ||
                        "",

                    atribuicao:
                        musica.artist_name ||
                        "",

                    duracao:
                        musica.duration
                            ? Number(musica.duration)
                            : null,

                    tipoArquivo:
                        "audio/mpeg",

                    tamanho:
                        null,

                    imagem:
                        musica.image ||
                        "",

                    classificacao:
                        classificacao.classificacao,

                    comercial:
                        classificacao.comercial,

                    condicoes:
                        classificacao.condicoes,

                    tipoLicenca:
                        classificacao.tipoLicenca,

                    tipoUso:
                        "radio",

                    origemFonte:
                        "Jamendo"

                };

            });


        console.log(
            `🎵 Jamendo encontrou: ${resultados.length}`
        );


        return resultados;


    } catch (erro) {

        console.log(
            `⚠️ Jamendo indisponível: ${erro.message}`
        );

        return [];

    }

}

// =====================================================
// FONTE 4 — CCMIXTER
// =====================================================

async function pesquisarCCMixter(busca, usoComercial = false) {
    console.log(`🔎 ccMixter: ${busca}`);

    try {
        const parametros = new URLSearchParams({
            f: "json",
            t: "search_uploads",
            limit: "20",
            s: busca,
            search_type: "any"
        });

        if (usoComercial) {
            parametros.set("lic", "by");
        }

        const url =
            "https://ccmixter.org/api/query?" +
            parametros.toString();

        console.log("🌐 URL ccMixter:", url);

        const resposta = await buscarComTimeout(url, {
            headers: {
                "User-Agent": "RiverMusic/1.0 (River Tech)"
            }
        });

        if (!resposta.ok) {
            throw new Error(
                `ccMixter respondeu com status ${resposta.status}`
            );
        }

        const dados = await resposta.json();

        console.log(
            "📦 Resposta ccMixter:",
            JSON.stringify(dados).substring(0, 1000)
        );

        let resultadosBrutos = [];

        if (Array.isArray(dados)) {
            resultadosBrutos = dados;
        } else if (Array.isArray(dados.results)) {
            resultadosBrutos = dados.results;
        } else if (Array.isArray(dados.data)) {
            resultadosBrutos = dados.data;
        }

        // -------------------------------------------------
        // Busca detalhes dos uploads encontrados
        // -------------------------------------------------

        const resultados = await Promise.all(
            resultadosBrutos.map(async (musica, indice) => {

                const uploadId =
                    musica.upload_id ||
                    musica.id ||
                    "";

                const titulo =
                    musica.upload_name ||
                    musica.name ||
                    musica.title ||
                    `Faixa ccMixter ${indice + 1}`;

                const artista =
                    musica.user_real_name ||
                    musica.user_fullname ||
                    musica.artist ||
                    musica.user ||
                    "Artista desconhecido";

                const origem =
                    musica.file_page_url ||
                    (
                        uploadId
                            ? `https://ccmixter.org/files/${encodeURIComponent(
                                musica.user || ""
                            )}/${uploadId}`
                            : "https://ccmixter.org/"
                    );

                let detalhes = {};
                let arquivos = [];
                let linksDownload = {};

                // -------------------------------------------------
                // Consulta INFO
                // -------------------------------------------------

                if (uploadId) {
                    try {

                        const urlInfo =
                            "https://ccmixter.org/api/query?" +
                            new URLSearchParams({
                                f: "json",
                                dataview: "info",
                                ids: uploadId
                            }).toString();

                        const respostaInfo =
                            await buscarComTimeout(urlInfo, {
                                headers: {
                                    "User-Agent":
                                        "RiverMusic/1.0 (River Tech)"
                                }
                            });

                        if (respostaInfo.ok) {
                            const dadosInfo =
                                await respostaInfo.json();

                            if (Array.isArray(dadosInfo)) {
                                detalhes =
                                    dadosInfo[0] || {};
                            } else if (
                                Array.isArray(dadosInfo.results)
                            ) {
                                detalhes =
                                    dadosInfo.results[0] || {};
                            } else if (
                                Array.isArray(dadosInfo.data)
                            ) {
                                detalhes =
                                    dadosInfo.data[0] || {};
                            } else {
                                detalhes = dadosInfo || {};
                            }
                        }

                    } catch (erroInfo) {

                        console.log(
                            `⚠️ Detalhes ccMixter ${uploadId}:`,
                            erroInfo.message
                        );
                    }
                }

                // -------------------------------------------------
                // Consulta FILES
                // -------------------------------------------------

                if (uploadId) {
                    try {

                        const urlFiles =
                            "https://ccmixter.org/api/query?" +
                            new URLSearchParams({
                                f: "json",
                                dataview: "files",
                                ids: uploadId
                            }).toString();

                        const respostaFiles =
                            await buscarComTimeout(urlFiles, {
                                headers: {
                                    "User-Agent":
                                        "RiverMusic/1.0 (River Tech)"
                                }
                            });

                        if (respostaFiles.ok) {
                            const dadosFiles =
                                await respostaFiles.json();

                            if (Array.isArray(dadosFiles)) {
                                arquivos = dadosFiles;
                            } else if (
                                Array.isArray(dadosFiles.results)
                            ) {
                                arquivos = dadosFiles.results;
                            } else if (
                                Array.isArray(dadosFiles.data)
                            ) {
                                arquivos = dadosFiles.data;
                            }
                        }

                    } catch (erroFiles) {

                        console.log(
                            `⚠️ Arquivos ccMixter ${uploadId}:`,
                            erroFiles.message
                        );
                    }
                }

                // -------------------------------------------------
                // Consulta LINKS_DL
                // -------------------------------------------------

                if (uploadId) {
                    try {

                        const urlLinks =
                            "https://ccmixter.org/api/query?" +
                            new URLSearchParams({
                                f: "json",
                                dataview: "links_dl",
                                ids: uploadId
                            }).toString();

                        const respostaLinks =
                            await buscarComTimeout(urlLinks, {
                                headers: {
                                    "User-Agent":
                                        "RiverMusic/1.0 (River Tech)"
                                }
                            });

                        if (respostaLinks.ok) {
                            const dadosLinks =
                                await respostaLinks.json();

                            if (Array.isArray(dadosLinks)) {
                                linksDownload =
                                    dadosLinks[0] || {};
                            } else if (
                                Array.isArray(dadosLinks.results)
                            ) {
                                linksDownload =
                                    dadosLinks.results[0] || {};
                            } else if (
                                Array.isArray(dadosLinks.data)
                            ) {
                                linksDownload =
                                    dadosLinks.data[0] || {};
                            } else {
                                linksDownload =
                                    dadosLinks || {};
                            }
                        }

                    } catch (erroLinks) {

                        console.log(
                            `⚠️ Download ccMixter ${uploadId}:`,
                            erroLinks.message
                        );
                    }
                }

                // -------------------------------------------------
                // Descobre o arquivo de áudio
                // -------------------------------------------------

                let arquivo = "";

                const candidatosArquivo = [

                    detalhes.file,
                    detalhes.file_url,
                    detalhes.media_url,
                    detalhes.audio,
                    detalhes.stream_url,

                    linksDownload.file,
                    linksDownload.file_url,
                    linksDownload.download,
                    linksDownload.download_url,
                    linksDownload.url,

                    arquivos[0]?.file,
                    arquivos[0]?.file_url,
                    arquivos[0]?.url,
                    arquivos[0]?.download_url,
                    arquivos[0]?.media_url

                ];

                arquivo =
                    candidatosArquivo.find(
                        valor =>
                            typeof valor === "string" &&
                            valor.trim() !== ""
                    ) || "";

                // -------------------------------------------------
                // Fallback oficial de download do ccMixter
                // -------------------------------------------------

                const download =
                    linksDownload.download_url ||
                    linksDownload.download ||
                    linksDownload.url ||
                    detalhes.download_url ||
                    detalhes.download ||
                    (
                        uploadId && musica.user
                            ? `https://ccmixter.org/download/${encodeURIComponent(
                                musica.user
                            )}/${uploadId}`
                            : ""
                    );

                // -------------------------------------------------
                // Licença
                // -------------------------------------------------

                const licenca =
                    detalhes.lic ||
                    detalhes.license ||
                    musica.lic ||
                    musica.license ||
                    musica.license_name ||
                    "Creative Commons";

                const urlLicenca =
                    detalhes.license_url ||
                    musica.license_url ||
                    "";

                const classificacao =
                    classificarLicenca(
                        licenca,
                        urlLicenca
                    );

                // -------------------------------------------------
                // Resultado padronizado para o script.js
                // -------------------------------------------------

                return {

                    id:
                        `ccmixter-${uploadId || indice}`,

                    titulo,

                    artista,

                    album: "",

                    fonte: "ccMixter",

                    origem,

                    arquivo,

                    download,

                    downloadPermitido:
                        Boolean(download),

                    licenca,

                    versaoLicenca: "",

                    urlLicenca,

                    atribuicao:
                        detalhes.user_real_name ||
                        musica.user_real_name ||
                        artista,

                    duracao:
                        detalhes.duration ||
                        musica.duration
                            ? Number(
                                detalhes.duration ||
                                musica.duration
                            )
                            : null,

                    tipoArquivo:
                        detalhes.mime ||
                        arquivos[0]?.mime ||
                        "audio/mpeg",

                    tamanho:
                        detalhes.filesize ||
                        arquivos[0]?.filesize ||
                        null,

                    classificacao:
                        classificacao.classificacao,

                    comercial:
                        classificacao.comercial,

                    condicoes:
                        classificacao.condicoes,

                    tipoLicenca:
                        classificacao.tipoLicenca,

                    tipoUso: "radio",

                    origemFonte: "ccMixter"
                };
            })
        );

        console.log(
            `🎵 ccMixter encontrou: ${resultados.length}`
        );

        return resultados;

    } catch (erro) {

        console.log(
            `⚠️ ccMixter indisponível: ${erro.message}`
        );

        return [];
    }
}


// =====================================================
// STATUS
// =====================================================

app.get("/api/rivermusic/status", (req, res) => {

    res.json({

        sucesso: true,

        sistema: "River Music",

        status: "Servidor online",

        versao: "1.0.0"

    });

});


// =====================================================
// PESQUISA MULTI-FONTE
// =====================================================

app.get("/api/rivermusic/pesquisar", verificarAcessoRiverMusic, async (req, res) => {

    try {

        const busca =
            req.query.q?.trim();

            // =====================================================
// INTERPRETAÇÃO DO COMANDO DE PESQUISA
// =====================================================

const textoBusca = busca.toLowerCase();

const exigeUsoComercial =
    textoBusca.includes("uso comercial") ||
    textoBusca.includes("comercial") ||
    textoBusca.includes("para rádio") ||
    textoBusca.includes("para radio") ||
    textoBusca.includes("uso profissional");

const termosBusca = textoBusca
    .replace(/uso comercial/gi, "")
    .replace(/uso profissional/gi, "")
    .replace(/para rádio/gi, "")
    .replace(/para radio/gi, "")
    .replace(/para uso comercial/gi, "")
    .replace(/para uso profissional/gi, "")
    .replace(/\bpara\b/gi, "")
    .replace(/\bcomercial\b/gi, "")
    .replace(/\blivre\b/gi, "")
    .replace(/\bliberada\b/gi, "")
    .replace(/\bliberado\b/gi, "")
    .replace(/\s+/g, " ")
    .trim();

console.log(
    `🎯 Uso comercial solicitado: ${exigeUsoComercial ? "SIM" : "NÃO"}`
);

console.log(
    `🔎 Termos musicais: ${termosBusca}`
);


        if (!busca) {

            return res.status(400).json({

                sucesso: false,

                erro:
                    "Digite o que deseja pesquisar."

            });

        }


        console.log("");
        console.log("=================================");
        console.log(`🎵 RIVER MUSIC`);
        console.log(`🔎 Busca: ${busca}`);
        console.log("=================================");


        // Pesquisa nas duas fontes
        const [
    openverse,
    wikimedia,
    jamendo,
    ccmixter
] = await Promise.all([

    pesquisarOpenverse(termosBusca),

    pesquisarWikimedia(termosBusca),

    pesquisarJamendo(termosBusca),

    pesquisarCCMixter(
        termosBusca,
        exigeUsoComercial
    )

]);


        // Junta resultados
const resultados = [

    ...ccmixter,

    ...jamendo,

    ...openverse,

    ...wikimedia

];


// Filtra resultados que não parecem ser músicas
const resultadosFiltrados =
    resultados.filter(pareceMusica);


    // =====================================================
// PRIORIZAÇÃO POR USO COMERCIAL
// =====================================================

let resultadosFinais = resultadosFiltrados;

if (exigeUsoComercial) {

    resultadosFinais = [...resultadosFiltrados].sort(
        (a, b) => {

            const prioridade = {
                "🟢": 1,
                "🟡": 2,
                "⚪": 3,
                "🔴": 4
            };

            const prioridadeA =
                prioridade[a.classificacao?.substring(0, 2)] || 5;

            const prioridadeB =
                prioridade[b.classificacao?.substring(0, 2)] || 5;

            return prioridadeA - prioridadeB;
        }
    );

    console.log(
        "💼 Resultados comerciais priorizados."
    );
}


console.log(
    `📚 Resultados encontrados: ${resultados.length}`
);

console.log(
    `🎵 Resultados musicais: ${resultadosFiltrados.length}`
);

        res.json({

            sucesso: true,

            busca,

            total:
                resultadosFinais.length,

            fontes: {

                ccmixter:
                    ccmixter.length,

                jamendo:
                    jamendo.length,

                openverse:
                    openverse.length,

                wikimedia:
                    wikimedia.length

            },

            resultados: resultadosFinais

        });


    } catch (erro) {

        console.error(
            "❌ Erro geral na pesquisa:",
            erro
        );


        res.status(500).json({

            sucesso: false,

            erro:
                "Não foi possível realizar a pesquisa.",

            detalhes:
                erro.message

        });

    }

});


app.get("/api/status", (req, res) => {
    res.json({ sucesso:true, sistema:"River Tech Central + River Music", status:"Servidor online", riverMusic:true });
});


// =====================================================
// SERVIDOR
// =====================================================

app.listen(PORT, () => {

    console.log("=================================");
    console.log("🎵 RIVER MUSIC");
    console.log("Servidor iniciado com sucesso!");
    console.log(`http://localhost:${PORT}`);
    console.log("=================================");

});