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
    cv.threshold(cinza, binaria, 140, 255, cv.THRESH_BINARY_INV);

    let contornos = new cv.MatVector();
    let hierarquia = new cv.Mat();
    cv.findContours(binaria, contornos, hierarquia, cv.RETR_EXTERNAL, cv.CHAIN_APPROX_SIMPLE);

    let pontosAncoras = [];
    for (let i = 0; i < contornos.size(); ++i) {
        let cnt = contornos.get(i);
        let rect = cv.boundingRect(cnt);
        if (rect.width * rect.height > 500 && rect.width / rect.height > 0.8) {
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

        // NORMALIZAÇÃO: Forçamos a imagem para 1000x1414 (O tamanho do nosso HTML)
        let ptsDestino = cv.matFromArray(4, 1, cv.CV_32FC2, [0, 0, 1000, 0, 1000, 1414, 0, 1414]);
        let M = cv.getPerspectiveTransform(ptsOrigem, ptsDestino);
        let reta = new cv.Mat();
        cv.warpPerspective(binaria, reta, M, new cv.Size(1000, 1414));

        // COORDENADAS ESPELHADAS DO HTML
        const config = {
            colunasX: [120, 580],       
            opcoesX: [0, 50, 100, 150, 200], 
            inicioY: 305,               
            espacoY: 40, 
            raio: 22
        };

        let tempRes = [];
        let miraSeta = new cv.Mat.zeros(1414, 1000, cv.CV_8UC4);
        for (let col = 0; col < 2; col++) {
            for (let q = 0; q < 26; q++) {
                let marcadas = [];
                for (let opt = 0; opt < 5; opt++) {
                    let x = config.colunasX[col] + config.opcoesX[opt];
                    let y = config.inicioY + (q * config.espacoY);
                    
                    cv.rectangle(miraSeta, new cv.Point(x, y), new cv.Point(x + config.raio, y + config.raio), new cv.Scalar(255, 0, 0, 255), 1);
                    
                    let rect = new cv.Rect(x, y, config.raio, config.raio);
                    let roi = reta.roi(rect);
                    if (cv.countNonZero(roi) > (config.raio * config.raio * 0.25)) marcadas.push(["A","B","C","D","E"][opt]);
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

        ptsOrigem.delete(); ptsDestino.delete(); M.delete(); M_inv.delete(); reta.delete(); miraSeta.delete(); miraOriginal.delete();
    }
    const canvasTemp = document.createElement('canvas');
    cv.imshow(canvasTemp, previewMat);
    setPreview(canvasTemp.toDataURL());
    src.delete(); cinza.delete(); binaria.delete(); contornos.delete(); hierarquia.delete(); previewMat.delete();
    return resultados;
};