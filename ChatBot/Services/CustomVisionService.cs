using System;
using System.Linq;
using System.Threading.Tasks;
using ChatBot.Utils;
using Microsoft.Azure.CognitiveServices.Vision.CustomVision.Prediction;
using Microsoft.Azure.CognitiveServices.Vision.CustomVision.Prediction.Models;

namespace ChatBot.Services
{
    public class CustomVisionService
    {
        private readonly PredictionEndpoint _endpoint;
        private readonly string _projectId;

        public CustomVisionService(string predictionKey, string projectId)
        {
            _endpoint = new PredictionEndpoint { ApiKey = predictionKey };
            _projectId = projectId;
        }

        public async Task<PredictionModel> AnalyzeAsync(string imagePath)
        {
            var image = await ImageUtils.GetImageStreamAsync(imagePath);
            var prediction = await _endpoint.PredictImageAsync(Guid.Parse(_projectId), image);
            return prediction.Predictions.Where(x => x.Probability > 0.60).Count() > 0 ? prediction.Predictions.OrderByDescending(x => x.Probability).First() : null;
        }
    }
}
