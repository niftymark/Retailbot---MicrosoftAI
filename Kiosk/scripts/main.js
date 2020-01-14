(async function () {
  const API_BASE_URL = 'https://chatbot-emretail.azurewebsites.net/api';
  const BOT_HANDLE = 'chatbot-emretail';
  const AUDIO_WORKER_DIR = 'scripts/lib/web-audio-recorder/';  // must end with slash
  const directLine = new DirectLine.DirectLine({
      secret: 'u2RgHDaZcYU.iyb0nhvNg-bfTDY3tVKqKBngGq13CYvXj2LjKPVFQDc',
  });
  let audioRecorder;

  function getAccessToCamera() {
    // use MediaDevices API to start reading video stream for taking a photo
    // docs: https://developer.mozilla.org/en-US/docs/Web/API/MediaDevices/getUserMedia
    if (navigator.mediaDevices) {
      navigator.mediaDevices
        .getUserMedia({ video: true })
        .then(function(stream) {
          // permission granted:
          const videoEl = document.querySelector('video');
          videoEl.srcObject = stream;
        })
        .catch(function(error) {
          console.log('No access to camera. Error: ', error);
        });
    }
  }

  function getAdImage(botMessage) {
    let imageURL = null;
    for (let i = 0; i < botMessage.attachments.length; i++) {
      const attachment = botMessage.attachments[i];
      if (attachment.contentType === "application/vnd.microsoft.card.hero") {
        imageURL = attachment.content.images[0].url;
        break;
      }
    }
    return imageURL;
  };

  function getAudioReply(botMessage) {
    let audioURL = null;
    for (let i = 0; i < botMessage.attachments.length; i++) {
      const attachment = botMessage.attachments[i];
      if (attachment.contentType === 'application/vnd.microsoft.card.audio') {
        audioURL = attachment.content.media[0].url;
        break;
      }
    }
    return audioURL;
  }

  async function getAudioRecorder() {
    let recorder = null;
    const audioSource = await getAudioSource();
    if (audioSource) {
      recorder = new WebAudioRecorder(audioSource, {
        workerDir: AUDIO_WORKER_DIR
      });

      // recorder event handlers
      recorder.onComplete = function(recorder, blob) {
        directLine
          .postActivity({
            from: { id: 'user' },
            type: 'message',
            // text: 'tell me what to wear',
            attachments: [{
              contentType: 'audio/wav',
              contentUrl: URL.createObjectURL(blob),
              name: 'what-to-wear.wav'
            }],
          })
          .subscribe();
      };
      recorder.onError = function(recorder, blob) {
        recorder.finishRecording();
        alert('Unable to record message. Please try again.');
      };
    }
    return recorder
  }

  async function getAudioSource() {
    let source = null;
    if (navigator.mediaDevices) {
      try {
        const audioContext = new AudioContext();
        const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
        source = audioContext.createMediaStreamSource(stream);
      } catch (error) {
        console.log('Failed to set up audio stream: ', error);
      }
    }
    return source;
  }

  function getGarments(botMessage) {
    let products = null;
    for (let i = 0; i < botMessage.attachments.length; i++) {
      const attachment = botMessage.attachments[i];
      if (attachment.name === 'products') {
        products = attachment.content.products;
        break;
      }
    }
    return products;
  }

  // Get text message:
  function getTextMessage(botMessage) {
    let message = botMessage.text;
    let response = null;

    // Greeting is assumed to be of the form: "Hi <name>! ..."
    if (/Hi/.test(message)) {
      message = message.split('!');
      const main = message[0].trim();
      const secondary = message[1] && message[1].trim();
      response = [ main, secondary ];
    } else if (/upload.*picture/.test(message)) {
      // Upload a picture to show your style!
      response = [message];
    } else if (/similar products/.test(message)) {
      // Similar products
      response = [message];
    }
    return response;
  }

  function getGarmentItemHTML(garment) {
    return `<div id='${garment.id}' class='item'>
      <img src='${garment.image}' alt=''/>
      <b>${garment.title}</b>
      <em>${garment.price}</em>
    </div>`;
  }

  // Hide spinner if there's one currently showing
  function hideSpinner() {
    const spinnerEl = document.querySelector('.spinner');
    if (spinnerEl) {
      const hiddenEl = spinnerEl.parentElement.querySelector('.invisible');
      spinnerEl.remove();
      hiddenEl.classList.remove('invisible');
    }
  }

  function initSubscriptions() {
    // Add event listeners & subscriptions
    const photoButton = document.querySelector('aside .unrecognized button');
    const micButton = document.querySelector('aside .recognized .mic-icon');
    const uploadButton = document.querySelector('aside .bottom input[type="file"]');

    photoButton.addEventListener('click', recognizeUser);
    micButton.addEventListener('mousedown', recordMessage);
    micButton.addEventListener('mouseup', sendMessageToBot);
    uploadButton.addEventListener('change', uploadFile);

    directLine.activity$
      .filter(
        activity => activity.type === 'message' && activity.from.id === BOT_HANDLE
      )
      .subscribe(message => {
        console.info(message);
        const videoEl = document.querySelector('video');
        const messageUnderstood = wasMessageUnderstood(message);

        if (messageUnderstood) {
          const adImage = getAdImage(message);
          const textMessage = getTextMessage(message);
          const garments = getGarments(message);
          const audioFile = getAudioReply(message);

          if (adImage) replaceAdImage(adImage);
          if (textMessage && textMessage.length) updateTextMessage(textMessage);
          if (garments) populateGarments(garments);
          if (audioFile) {
            const audio = new Audio(audioFile);
            audio.play();
          }
        } else {
          alert('Bot did not understand your request. Please try again.');
        }
        restoreUI(videoEl);
      });
  }

  function isGreetingMessage(message) {
    return message.length >= 2;
  }

  function populateGarments(data) {
    const productsViewEl = document.querySelector('[data-products-view]');
    const topContainerList = document.querySelector('main .top .list');
    const bottomContainerList = document.querySelector('main .bottom .list');

    let topList = [];
    let bottomList = [];

    if (Array.isArray(data)) {
      // Only one list of products
      const listLength = Math.floor(data.length / 2);
      topList = data.splice(0, listLength).map(garment => getGarmentItemHTML(garment));
      bottomList = data.map(garment => getGarmentItemHTML(garment));
    } else {
      // Assume there's a matching and suggested list of products
      topList = data.matching.map(garment => getGarmentItemHTML(garment));
      bottomList = data.suggested.map(garment => getGarmentItemHTML(garment));
    }
    productsViewEl.setAttribute("data-products-view", "list");
    topContainerList.innerHTML = topList.join('');
    bottomContainerList.innerHTML = bottomList.join('');
  }

  async function recognizeUser(e) {
    e.preventDefault();
    showSpinner(e.currentTarget);

    const videoEl = document.querySelector('video');
    try {
      const res = await takePhoto(videoEl);
      if (res.isValid) {
        console.log('User successfully recognized');
        directLine
          .postActivity({
            from: { id: "user", name: res.name },
            type: "message",
            text: "hi",
            channelData: {
              gender: res.gender
            }
          })
          .subscribe(
            () => console.log("User greeting sent"),
            error => {
              console.log("Unable to connect to bot and send greeting. Error: ", error);
              throw error;
          });
      } else {
        alert('User not recognized. Please try taking the picture again.');
        restoreUI(videoEl);
      }
    } catch (error) {
      alert('Unable to process the image. Please try taking the picture again.');
      restoreUI(videoEl);
    }
  }

  async function recordMessage() {
    if (audioRecorder) {
      audioRecorder.startRecording();
    } else {
      alert('Unble to record message.');
    }
  }

  function restoreUI(videoEl) {
    // Start video stream again
    if (videoEl.paused) videoEl.play();
    hideSpinner();
  }

  function replaceAdImage(imageUrl) {
    const productsViewEl = document.querySelector("[data-products-view]");
    const adElement = document.querySelector('main .ad-view');

    productsViewEl.setAttribute("data-products-view", "ad");
    adElement.style.backgroundImage = `url(${imageUrl})`;
  };

  function sendMessageToBot(e) {
    if (audioRecorder) {
      showSpinner(e.currentTarget);
      audioRecorder.finishRecording();
    }
  }

  function showSpinner(buttonEl) {
    const spinner = document.createElement('div');
    spinner.classList.add('spinner');
    spinner.innerHTML = '<div class="bounce1"></div>\
                         <div class="bounce2"></div>\
                         <div class="bounce3"></div>';
    buttonEl.classList.add('invisible');
    buttonEl.parentElement.append(spinner);
  }

  function submitUserPhotoForRecognition(blob) {
    // Edge doesn't support File constructor so we'll use the Blob constructor instead
    // https://stackoverflow.com/questions/40911927/instantiate-file-object-in-microsoft-edge
    const image = new Blob([blob], { type: 'image/png' });
    const formData = new FormData();
    image.name = 'image.png';
    formData.append('file', image);

    return fetch(`${API_BASE_URL}/face-recognition/persons/recognize`, {
      method: 'POST',
      body: formData
    });
  }

  // Generate a still frame image from the stream in the <video>
  function takePhoto(videoEl) {
    return new Promise(function(resolve, reject) {
      const width = videoEl.offsetWidth;
      const height = videoEl.offsetHeight;

      const canvas = document.createElement('canvas');
      canvas.width = width;
      canvas.height = height;

      const context = canvas.getContext('2d');
      context.drawImage(videoEl, 0, 0, width, height);
      // Stop video stream to indicate to user that picture was taken
      videoEl.pause();

      canvas.toBlob(blob => {
        submitUserPhotoForRecognition(blob)
          .then(resp => resp.json())
          .then(resolve)
          .catch(reject);
      }, 'image/png');
    });
  }

  function updateTextMessage(message) {
    if (isGreetingMessage(message)) {
      const stateEl = document.querySelector('[data-user-state]');
      stateEl.setAttribute('data-user-state', 'recognized');
    }
    const hintEl = document.querySelector('.recognized .hint');

    if (message.length >= 2) {
      const greetingEl = document.querySelector('.recognized .greeting');
      greetingEl.innerText = message[0];
      hintEl.innerText = message[1];
    } else {
      hintEl.innerText = message[0];
    }
  }

  function uploadFile(e) {
    e.preventDefault();
    const targetEl = document.querySelector('aside .image-upload label');
    showSpinner(targetEl);
    var files = e.target.files;
    if (files.length) {
      const file = files[0];
      directLine
        .postActivity({
          from: { id: 'user' },
          type: 'message',
          attachments: [{
            contentType: file.type,
            contentUrl: URL.createObjectURL(file),
            name: file.name
          }],
        })
        .subscribe();
    }
  }

  function wasMessageUnderstood(botMessage) {
    return !(/Sorry/.test(botMessage.text));
  }

  // Get audio recorder async while executing the rest of the setup code
  const audioRecorderPromise = getAudioRecorder();
  getAccessToCamera();
  initSubscriptions();
  audioRecorder = await audioRecorderPromise;
})();
