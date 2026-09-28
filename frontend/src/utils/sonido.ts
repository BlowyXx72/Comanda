// DECISIÓN DE PROTOTIPO: el beep se genera con la Web Audio API (dos tonos
// cortos) en vez de cargar un archivo de audio, para no depender de un
// asset binario extra en el repo.
export function reproducirBeepPedidoListo() {
  if (typeof window === 'undefined' || !window.AudioContext) return;

  try {
    const contexto = new AudioContext();

    const tono = (inicioSeg: number) => {
      const oscilador = contexto.createOscillator();
      const ganancia = contexto.createGain();
      oscilador.type = 'sine';
      oscilador.frequency.value = 880;
      const t0 = contexto.currentTime + inicioSeg;
      ganancia.gain.setValueAtTime(0.001, t0);
      ganancia.gain.linearRampToValueAtTime(0.2, t0 + 0.02);
      ganancia.gain.exponentialRampToValueAtTime(0.001, t0 + 0.25);
      oscilador.connect(ganancia);
      ganancia.connect(contexto.destination);
      oscilador.start(t0);
      oscilador.stop(t0 + 0.25);
    };

    tono(0);
    tono(0.3);
    setTimeout(() => contexto.close(), 800);
  } catch {
    // Si el navegador bloquea audio sin interacción previa del usuario, la
    // alerta visual (mesa-card--recien-listo) sigue funcionando igual.
  }
}
