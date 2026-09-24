/* =====================================================
   RIVER MUSIC
   SCRIPT PRINCIPAL
   ===================================================== */

const campoBusca = document.getElementById("campoBusca");
const btnPesquisar = document.getElementById("btnPesquisar");

const estadoInicial = document.getElementById("estadoInicial");
const contadorResultados = document.getElementById("contadorResultados");
const listaMusicas = document.getElementById("listaMusicas");

const exemplos = document.querySelectorAll(".exemplo-busca");


/* =====================================================
   CONFIGURAÇÃO
   ===================================================== */

const API_URL = (() => {
    const base = String(window.RIVER_CONFIG?.riverMusicBackendUrl || "").trim().replace(/\/$/, "");
    return `${base}/api/rivermusic/pesquisar`;
})();

let audioAtual = null;


/* =====================================================
   PROTEÇÃO HTML
   ===================================================== */

function escaparHTML(texto = "") {

    return String(texto)
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#039;");

}


/* =====================================================
   PESQUISA
   ===================================================== */

async function realizarPesquisa() {

    const comando = campoBusca.value.trim();


    if (!comando) {

        campoBusca.focus();

        return;

    }


    console.log(
        "🔎 Iniciando pesquisa:",
        comando
    );


    /* Limpar resultados anteriores */

    listaMusicas.innerHTML = "";


    /* Mostrar carregamento */

    estadoInicial.style.display = "block";

    estadoInicial.innerHTML = `

        <div class="estado-icone">
            🔎
        </div>

        <h3>Pesquisando músicas...</h3>

        <p>
            O River Music está consultando as fontes disponíveis.
        </p>

    `;


    contadorResultados.textContent =
        "Pesquisando...";


    try {

        const headers = {};
        if (window.riverMusicSession?.access_token) {
            headers.Authorization = `Bearer ${window.riverMusicSession.access_token}`;
        }

        const resposta = await fetch(
            `${API_URL}?q=${encodeURIComponent(comando)}`,
            { headers }
        );


        console.log(
            "📡 Resposta da API:",
            resposta.status
        );


        if (!resposta.ok) {

            throw new Error(
                `Erro HTTP ${resposta.status}`
            );

        }


        const dados =
            await resposta.json();


        console.log(
            "🎵 Dados recebidos:",
            dados
        );


        if (!dados.sucesso) {

            throw new Error(
                dados.erro ||
                "A pesquisa não foi concluída."
            );

        }


        exibirResultados(dados);


    } catch (erro) {

        console.error(
            "❌ Erro na pesquisa:",
            erro
        );


        estadoInicial.style.display = "block";

        estadoInicial.innerHTML = `

            <div class="estado-icone">
                ⚠️
            </div>

            <h3>Erro ao realizar pesquisa</h3>

            <p>
                ${escaparHTML(erro.message)}
            </p>

        `;


        contadorResultados.textContent =
            "Erro na pesquisa";

    }

}


/* =====================================================
   EXIBIR RESULTADOS
   ===================================================== */

function exibirResultados(dados) {

    const resultados =
        dados.resultados || [];


    console.log(
        "📚 Resultados recebidos:",
        resultados.length
    );


    contadorResultados.textContent =
        `${resultados.length} música${resultados.length === 1 ? "" : "s"}`;


    if (!resultados.length) {

        estadoInicial.style.display = "block";

        estadoInicial.innerHTML = `

            <div class="estado-icone">
                🎵
            </div>

            <h3>Nenhuma música encontrada</h3>

            <p>
                Tente pesquisar por outro nome,
                gênero ou artista.
            </p>

        `;

        return;

    }


    /* Esconder mensagem inicial */

    estadoInicial.style.display = "none";


    /* Criar cards */

    listaMusicas.innerHTML =
        resultados
            .map(criarCardMusica)
            .join("");


    console.log(
        "✅ Cards inseridos:",
        listaMusicas.children.length
    );


    configurarBotoes();

}


/* =====================================================
   CRIAR CARD
   ===================================================== */

function criarCardMusica(musica) {

    const titulo =
        escaparHTML(
            musica.titulo ||
            "Título desconhecido"
        );


    const artista =
        escaparHTML(
            musica.artista ||
            "Artista desconhecido"
        );


    const fonte =
        escaparHTML(
            musica.fonte ||
            musica.origemFonte ||
            "Fonte desconhecida"
        );


    const licenca =
        escaparHTML(
            musica.licenca ||
            "Licença não informada"
        );


    const classificacao =
        musica.classificacao ||
        "⚪ LICENÇA NÃO CONFIRMADA";


    const condicoes =
        escaparHTML(
            musica.condicoes ||
            "Verifique a licença na fonte original."
        );


    /* =================================================
       EXPLICAÇÃO DA CLASSIFICAÇÃO
       ================================================= */

    let explicacaoLicenca =
        "A licença desta música precisa ser verificada na fonte original.";


    if (classificacao.includes("🟢")) {

        explicacaoLicenca =
            "Uso comercial permitido conforme as condições da licença.";

    }

    else if (classificacao.includes("🟡")) {

        explicacaoLicenca =
            "Uso permitido, mas existem condições que devem ser observadas.";

    }

    else if (classificacao.includes("🔴")) {

        explicacaoLicenca =
            "Uso comercial não permitido sem autorização adicional.";

    }

    else if (classificacao.includes("⚪")) {

        explicacaoLicenca =
            "A licença não foi confirmada. Verifique os direitos na fonte original.";

    }


    const arquivo =
        musica.arquivo ||
        "";


    const origem =
        musica.origem ||
        "";


    const urlLicenca =
        musica.urlLicenca ||
        "";


    let classeLicenca =
        "licenca-desconhecida";


    if (classificacao.includes("🟢")) {

        classeLicenca =
            "licenca-verde";

    }

    else if (classificacao.includes("🟡")) {

        classeLicenca =
            "licenca-amarela";

    }

    else if (classificacao.includes("🔴")) {

        classeLicenca =
            "licenca-vermelha";

    }


    return `

        <article class="card-musica">

            <div class="card-musica-conteudo">

                <div class="musica-icone">
                    🎵
                </div>


                <div class="musica-informacoes">

                    <h4>
                        ${titulo}
                    </h4>


                    <p class="musica-artista">
                        ${artista}
                    </p>


                    <div class="musica-detalhes">

                        <span>
                            📚 ${fonte}
                        </span>

                        <span>
                            📜 ${licenca}
                        </span>

                    </div>


                    <div class="status-licenca ${classeLicenca}">

                        <strong>
                            ${classificacao}
                        </strong>


                        <small>
                            ${escaparHTML(explicacaoLicenca)}
                        </small>


                        <small class="condicoes-licenca">
                            ${condicoes}
                        </small>

                    </div>


                    <div class="acoes-musica">

                        ${
                            arquivo
                            ? `
                                <button
                                    class="btn-ouvir"
                                    data-arquivo="${escaparHTML(arquivo)}"
                                >
                                    ▶️ Ouvir
                                </button>
                              `
                            : ""
                        }


                        ${
                            arquivo
                            ? `
                                <button
                                    class="btn-baixar"
                                    data-arquivo="${escaparHTML(arquivo)}"
                                    data-classificacao="${escaparHTML(classificacao)}"
                                >
                                    ⬇ Baixar
                                </button>
                              `
                            : ""
                        }


                        ${
                            origem
                            ? `
                                <a
                                    class="btn-fonte"
                                    href="${escaparHTML(origem)}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    🔗 Ver fonte
                                </a>
                              `
                            : ""
                        }


                        ${
                            urlLicenca
                            ? `
                                <a
                                    class="btn-licenca"
                                    href="${escaparHTML(urlLicenca)}"
                                    target="_blank"
                                    rel="noopener noreferrer"
                                >
                                    📜 Ver licença
                                </a>
                              `
                            : ""
                        }

                    </div>

                </div>

            </div>

        </article>

    `;

}


/* =====================================================
   CONFIGURAR BOTÕES
   ===================================================== */

function configurarBotoes() {


    /* =================================================
       OUVIR
       ================================================= */

    document
        .querySelectorAll(".btn-ouvir")
        .forEach(function(botao) {

            botao.addEventListener(
                "click",
                function() {

                    const arquivo =
                        botao.dataset.arquivo;


                    if (!arquivo) {

                        return;

                    }


                    tocarMusica(
                        arquivo
                    );

                }
            );

        });


    /* =================================================
       BAIXAR
       ================================================= */

    document
        .querySelectorAll(".btn-baixar")
        .forEach(function(botao) {

            botao.addEventListener(
                "click",
                function() {

                    const arquivo =
                        botao.dataset.arquivo;


                    const classificacao =
                        botao.dataset.classificacao;


                    if (!arquivo) {

                        return;

                    }


                    baixarMusica(
                        arquivo,
                        classificacao
                    );

                }
            );

        });

}


/* =====================================================
   REPRODUÇÃO
   ===================================================== */

function tocarMusica(arquivo) {


    if (audioAtual) {

        audioAtual.pause();

    }


    audioAtual =
        new Audio(arquivo);


    audioAtual.play()
        .then(function() {

            console.log(
                "▶️ Reprodução iniciada"
            );

        })
        .catch(function(erro) {

            console.error(
                "❌ Erro ao reproduzir:",
                erro
            );

            alert(
                "Não foi possível reproduzir este arquivo."
            );

        });

}


/* =====================================================
   DOWNLOAD
   ===================================================== */

function baixarMusica(
    arquivo,
    classificacao
) {

    let mensagem;


    if (classificacao.includes("🟢")) {

        mensagem =
            "Esta música está classificada como permitida para uso comercial.";


    } else if (classificacao.includes("🟡")) {

        mensagem =
            "Esta música possui condições de licença. Verifique a atribuição e os demais requisitos antes de utilizá-la.";


    } else if (classificacao.includes("🔴")) {

        mensagem =
            "ATENÇÃO: a licença informa que o uso comercial NÃO é permitido. O download será realizado, mas o arquivo não deve ser utilizado comercialmente sem autorização adicional.";


    } else {

        mensagem =
            "ATENÇÃO: a licença desta música não foi confirmada. Verifique os direitos na fonte original antes de utilizá-la.";

    }


    const confirmar =
        window.confirm(
            `${mensagem}\n\nDeseja continuar com o download?`
        );


    if (!confirmar) {

        return;

    }


    const link =
        document.createElement("a");


    link.href =
        arquivo;


    link.target =
        "_blank";


    link.rel =
        "noopener noreferrer";


    link.download =
        "";


    document.body.appendChild(link);


    link.click();


    link.remove();


    console.log(
        "⬇ Download solicitado:",
        arquivo
    );

}


/* =====================================================
   ENTER
   ===================================================== */

campoBusca.addEventListener(
    "keydown",
    function(event) {

        if (event.key === "Enter") {

            realizarPesquisa();

        }

    }
);


/* =====================================================
   BOTÃO PESQUISAR
   ===================================================== */

btnPesquisar.addEventListener(
    "click",
    realizarPesquisa
);


/* =====================================================
   EXEMPLOS
   ===================================================== */

exemplos.forEach(
    function(botao) {

        botao.addEventListener(
            "click",
            function() {

                campoBusca.value =
                    botao.textContent.trim();

                campoBusca.focus();

            }
        );

    }
);


/* =====================================================
   INICIALIZAÇÃO
   ===================================================== */

console.log(
    "🎵 River Music iniciado."
);