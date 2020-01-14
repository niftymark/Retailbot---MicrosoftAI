using System.Threading.Tasks;
using ChatBot.Models;
using Microsoft.Azure.CognitiveServices.Language.TextAnalytics;
using Microsoft.Azure.CognitiveServices.Language.TextAnalytics.Models;
using Microsoft.Azure.CognitiveServices.Vision.Face;

namespace ChatBot.Services
{
    public class TextAnalyticsService
    {
        private readonly string _endpoint;
        private readonly string _subscriptionKey;

        public TextAnalyticsService(string subscriptionKey, string region)
        {
            _endpoint = $"https://{region}.api.cognitive.microsoft.com";
            _subscriptionKey = subscriptionKey;
        }

        public async Task<double> GetTextSentimentAsync(string input)
        {
            // Create a client.
            ITextAnalyticsClient client = new TextAnalyticsClient(new ApiKeyServiceClientCredentials(_subscriptionKey))
            {
                Endpoint = _endpoint
            };

            var sentiment = await client.SentimentAsync(new MultiLanguageBatchInput(
              new[] { new MultiLanguageInput(id: "0", language: "en", text: input) }
            ));

            return sentiment.Documents[0].Score.GetValueOrDefault();
        }
    }
}
