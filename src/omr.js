// src/omr.js
const esperarOpenCV = () => new Promise(res => {
    const check = () => (window.cv && window.cv.Mat) ? res() : setTimeout(check, 100);
    check();
});

export const processarProvaProfissional = async (canvasOriginal, setPreview) => {
    await esperarOpenCV();
    const cv = window.cv;

    let src = cv.imread(canvasOriginal);
    let cinza = new cv.Mat();
    cv.cvtColor(src, cinza, cv.COLOR_RGBA2GRAY);

    let binaria = new cv.Mat();
    // Aumentamos a sensibilidade para detectar os quadrados pretos
    cv.threshold(cinza, binaria, 120, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        let area = rect.width * rect.height;
        let proporcao = rect.width / rect.height;

        // Procurando quadrados pretos (âncoras)
        if (area > 200 && area < 3000 && proporcao > 0.7 && proporcao < 1.3) {
            pontosAncoras.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = new cv.Mat();
    cv.cvtColor(cinza, previewMat, cv.COLOR_GRAY2RGBA);

    // Se encontramos as 4 âncoras, fazemos a correção de perspectiva
    if (pontosAncoras.length >= 4) {
        // Ordenação dos pontos
        pontosAncoras.sort((a, b) => a.y - b.y);
        let superior = pontosAncoras.slice(0, 2).sort((a, b) => a.x - b.x);
        let inferior = pontosAncoras.slice(pontosAncoras.length - 2).sort((a, b) => b.x - a.x);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [
            superior[0].x, superior[0].y,
            superior[1].x, superior[1].y,
            inferior[0].x, inferior[0].y,
            inferior[1].x, inferior[1].y
        ]);

        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 800, 0, 800, 1100, 0, 1100]);
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, rta = reta, M, new cv.Size(800, 1100));

        // Desenhar mira verde no preview
        let corVerde = new cv.Scalar(0, 255, 0, 255);
        cv.line(previewMat, new cv.Point(superior[0].x, superior[0].y), new cv.Point(superior[1].x, superior[1].y), corVerde, 3);
        cv.line(previewMat, new cv.Point(superior[1].x, superior[1].y), new cv.Point(inferior[0].x, inferior[0].y), corVerde, 3);

        // LEITURA DAS QUESTÕES
        resultados = [];
        const config = { colunasX: [115, 500], opcoesX: [0, 36, 72, 108, 144], inicioY: 280, espacoY: 30.5 };
        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let marcadas = [];
                for (let opt = 0; opt < 5; opt++) {
                    let rect = new cv.Rect(config.colunasX[col] + config.opcoesX[opt], config.inicioY + (q * config.espacoY), 20, 20);
                    let roi = reta.roi(rect);
                    if (cv.countNonZero(roi) > 180) marcadas.push(["A", "B", "C", "D", "E"][opt]);
                    roi.delete();
                }
                resultados.push(marcadas.length === 1 ? marcadas[0] : (marcadas.length > 1 ? "X" : ""));
            }
        }
        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); reta.delete();
    } else {
        // Se não achou âncoras, desenha um X vermelho no preview para avisar
        let corVermelha = new cv.Scalar(255, 0, 0, 255);
        cv.line(previewMat, new cv.Point(0, 0), new cv.Point(previewMat.cols, previewMat.rows), corVermelha, 5);
        resultados = Array(52).fill("ERRO_ANCORA");
    }

    // Mostrar preview
    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());

    // Limpeza
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};