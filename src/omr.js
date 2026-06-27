// src/omr.js - VERSÃO FINAL SINCRONIZADA COM GABARITO HTML
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
    cv.threshold(cinza, binaria, 145, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        let area = rect.width * rect.height;
        if (area > 400 && area < 8000 && (rect.width/rect.height) > 0.7 && (rect.width/rect.height) < 1.3) {
            pontosAncoras.push({ x: rect.x + rect.width / 2, y: rect.y + rect.height / 2 });
        }
    }

    let resultados = Array(52).fill("");
    let previewMat = new cv.Mat();
    cv.cvtColor(cinza, previewMat, cv.COLOR_GRAY2RGBA);

    if (pontosAncoras.length >= 4) {
        pontosAncoras.sort((a, b) => a.y - b.y);
        let superior = pontosAncoras.slice(0, 2).sort((a, b) => a.x - b.x);
        let inferior = pontosAncoras.slice(pontosAncoras.length - 2).sort((a, b) => b.x - a.x);

        let ptsOrigem = cv.matFromArray(4, 1, cv.CV_32FC2, [
            superior[0].x, superior[0].y, superior[1].x, superior[1].y,
            inferior[0].x, inferior[0].y, inferior[1].x, inferior[1].y
        ]);

        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 800, 0, 800, 1131, 0, 1131]);
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, reta, M, new cv.Size(800, 1131));

        // --- CALIBRAÇÃO SINCRONIZADA COM GERADOR_TESTE.HTML ---
        const config = {
            colunasX: [78, 468],        // X inicial das colunas
            opcoesX: [0, 36.5, 73, 109.5, 146], // Espaço exato entre A-B-C-D-E
            inicioY: 282,               // Onde começa a Questão 01
            espacoY: 31.6,              // Aumentamos para 31.6 para corrigir o "Drift"
            raio: 18                    // Tamanho da mira
        };

        let tempRes = [];
        let corMira = new cv.Scalar(255, 0, 0, 255);
        let miraSeta = new cv.Mat.zeros(1131, 800, cv.CV_8UC4);

        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let marcadas = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = Math.round(config.colunasX[col] + config.opcoesX[opt]);
                    let y = Math.round(config.inicioY + (q * config.espacoY));

                    // Desenha o quadradinho da mira para você ver o ajuste
                    cv.rectangle(miraSeta, new cv.Point(x, y), new cv.Point(x + config.raio, y + config.raio), corMira, 1);

                    let rect = new cv.Rect(x, y, config.raio, config.raio);
                    let roi = reta.roi(rect);
                    let totalPixels = cv.countNonZero(roi);
                    
                    // Reduzimos a exigência para 25% para capturar melhor
                    if (totalPixels > (config.raio * config.raio * 0.25)) {
                        marcadas.push(["A", "B", "C", "D", "E"][opt]);
                    }
                    roi.delete();
                }
                tempRes.push(marcadas.length === 1 ? marcadas[0] : (marcadas.length > 1 ? "X" : ""));
            }
        }

        resultados = tempRes;

        let M_inv = cv.getPerspectiveTransform(ptsDestino, ptsOrigem);
        let miraOriginal = new cv.Mat();
        cv.warpPerspective(miraSeta, miraOriginal, M_inv, new cv.Size(src.cols, src.rows));
        cv.add(previewMat, miraOriginal, previewMat);
        cv.line(previewMat, new cv.Point(superior[0].x, superior[0].y), new cv.Point(superior[1].x, superior[1].y), new cv.Scalar(0, 255, 0, 255), 3);

        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); M_inv.delete(); reta.delete(); miraSeta.delete(); miraOriginal.delete();
    }
    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};