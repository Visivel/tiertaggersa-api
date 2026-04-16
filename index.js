const { execSync } = require('child_process');

// Função para instalar pacotes caso não estejam instalados
function instalarDependencias() {
  const pacotes = ['dotenv','express','cors','express-rate-limit','oceanic'];
  pacotes.forEach(pacote => {
    try {
      require.resolve(pacote);
      console.log(`O pacote "${pacote}" já está instalado.`);
    } catch (err) {
      console.log(`O pacote "${pacote}" não está instalado. Instalando...`);
      try {
        execSync(`npm install ${pacote}`, { stdio: 'inherit' });
        console.log(`Pacote "${pacote}" instalado com sucesso.`);
      } catch (installErr) {
        console.error(`Erro ao instalar o pacote "${pacote}":`, installErr.message);
      }
    }
  });
}

// Instalar dependências antes de iniciar o bot
instalarDependencias();
// Função para adicionar um delay
function delay(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// Função assíncrona para iniciar os bots com delay
async function startApi() {
  console.log("Inciando server");
  require('./server');
}

// Chama a função para iniciar os bots
startApi();
