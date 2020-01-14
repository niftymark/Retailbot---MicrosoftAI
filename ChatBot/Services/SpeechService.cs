using System;
using System.Collections.Generic;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Linq;
using System.Net.Http;
using System.Text;
using System.Threading;
using System.Threading.Tasks;
using System.Xml.Linq;
using ChatBot.Utils;
using Microsoft.CognitiveServices.Speech;
using Microsoft.Extensions.Configuration;

namespace ChatBot.Services
{
    public class SpeechService
    {
        [SuppressMessage("Microsoft.Usage", "CA2213:DisposableFieldsShouldBeDisposed", Justification = "Avoiding Improper Instantiation antipattern : https://docs.microsoft.com/en-us/azure/architecture/antipatterns/improper-instantiation/")]
        private static readonly HttpClient Client = GetClient();

        private readonly string _speechEndpoint;
        private readonly string _region;
        private readonly string _subscriptionKey;

        public SpeechService(IConfiguration configuration)
        {
            _region = configuration["region"];
            _subscriptionKey = configuration["speechKey"];
            _speechEndpoint = $"https://{_region}.tts.speech.microsoft.com/cognitiveservices/v1";
        }

        public async Task<string> RecognizeAudioAsync(string fileURL)
        {
            string result = string.Empty;
            var config = SpeechConfig.FromSubscription(_subscriptionKey, _region);

            var stopRecognition = new TaskCompletionSource<int>();

            using (var audioInput = await AudioUtils.DownloadWavFileAsync(fileURL))
            {
                using (var recognizer = new SpeechRecognizer(config, audioInput))
                {
                    // Subscribes to events.
                    recognizer.Recognized += (s, e) =>
                    {
                        if (e.Result.Reason == ResultReason.RecognizedSpeech)
                        {
                            result = e.Result.Text;
                        }
                    };

                    recognizer.Canceled += (s, e) =>
                    {

                        if (e.Reason == CancellationReason.Error)
                        {
                            result = $"NOMATCH: Audio file error ({e.ErrorDetails})";
                        }

                        stopRecognition.TrySetResult(0);
                    };

                    recognizer.SessionStopped += (s, e) =>
                    {
                        stopRecognition.TrySetResult(0);
                    };

                    // Starts continuous recognition. Uses StopContinuousRecognitionAsync() to stop recognition.
                    await recognizer.StartContinuousRecognitionAsync().ConfigureAwait(false);

                    // Waits for completion.
                    // Use Task.WaitAny to keep the task rooted.
                    Task.WaitAny(new[] { stopRecognition.Task });

                    // Stops recognition.
                    await recognizer.StopContinuousRecognitionAsync().ConfigureAwait(false);
                }
            }

            return string.IsNullOrEmpty(result) ? "NOMATCH: Speech could not be recognized." : result;
        }

        public async Task<byte[]> SynthesizeSpeechAsync(string message)
        {
            var request = new HttpRequestMessage(HttpMethod.Post, _speechEndpoint)
            {
                Content = new StringContent(GenerateSsml(message), Encoding.UTF8, "application/ssml+xml"),
            };

            var autToken = await AzureAuthenticationService.GetAccessToken(_subscriptionKey, _region);
            request.Headers.Add("Authorization", autToken);

            var responseMessage = await Client.SendAsync(request, HttpCompletionOption.ResponseContentRead, CancellationToken.None);
            responseMessage.EnsureSuccessStatusCode();
            var httpStream = await responseMessage.Content.ReadAsStreamAsync();

            // Convert stream to byte array
            using (var memoryStream = new MemoryStream())
            {
                await httpStream.CopyToAsync(memoryStream);
                return memoryStream.ToArray();
            }
        }

        private string GenerateSsml(string message)
        {
            XNamespace ns = "http://www.w3.org/2001/10/synthesis";
            var ssmlDoc = new XDocument(
              new XElement(
                ns + "speak",
                new XAttribute("version", "1.0"),
                new XAttribute(XNamespace.Xml + "lang", "en-US"),
                new XElement(
                  ns + "voice",
                  new XAttribute("name", "Microsoft Server Speech Text to Speech Voice (en-US, JessaRUS)"),
                  new XText(message))));

            return ssmlDoc.ToString();
        }

        private static HttpClient GetClient()
        {
            var result = new HttpClient(new HttpClientHandler { UseCookies = true });

            result.DefaultRequestHeaders.Add("X-Microsoft-OutputFormat", "riff-16khz-16bit-mono-pcm");
            result.DefaultRequestHeaders.Add("User-Agent", "Smart Retail Bot");

            return result;
        }
    }
}
