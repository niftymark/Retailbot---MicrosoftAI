using System;
using System.Diagnostics.CodeAnalysis;
using System.IO;
using System.Net;
using System.Net.Http;
using System.Net.Http.Headers;
using System.Threading.Tasks;
using ChatBot.Models;
using ChatBot.Utils;
using Newtonsoft.Json;

namespace ChatBot.Services
{
    public class BingVisualSearchService
    {
        private const string ServiceUri = "https://api.cognitive.microsoft.com/bing/v7.0/images";

        [SuppressMessage("Microsoft.Usage", "CA2213:DisposableFieldsShouldBeDisposed", Justification = "Avoiding Improper Instantiation antipattern : https://docs.microsoft.com/en-us/azure/architecture/antipatterns/improper-instantiation/")]
        private static readonly HttpClient Client = new HttpClient(new HttpClientHandler { UseCookies = true });
        private readonly string _bingSearchKey;

        public BingVisualSearchService(string bingSearchKey)
        {
            _bingSearchKey = bingSearchKey;
        }

        public async Task<BingVisualSearchResponse> FindSimilarProductsAsync(string imageUrl)
        {
            BingVisualSearchResponse result = null;
            try
            {
                var content = new MultipartFormDataContent("--------------------------498758971529224930840173");
                var image = await ImageUtils.GetImageAsync(imageUrl);
                content.Add(new ByteArrayContent(image)
                {
                    Headers =
                    {
                        ContentDisposition = new ContentDispositionHeaderValue("form-data")
                        {
                        Name = "image",
                        FileName = "image",
                        },
                        ContentType = new MediaTypeHeaderValue("image/jpeg"),
                    },
                });
                content.Headers.Add("Ocp-Apim-Subscription-Key", _bingSearchKey);

                using (var response = await Client.PostAsync($"{ServiceUri}/visualsearch?mkt=en-us&safeSearch=Strict", content))
                {
                    response.EnsureSuccessStatusCode();
                    var json = await response.Content.ReadAsStringAsync();
                    result = JsonConvert.DeserializeObject<BingVisualSearchResponse>(json);
                }
            }
            catch (Exception ex)
            {
                Console.WriteLine("Encountered exception. " + ex.Message);
            }

            return result;
        }

        public async Task<BingVisualSearchResponse> FindSimilarProductsAsync(string imageUrl, BoundingRectangle queryRectangle)
        {
            var cab = Math.Max(queryRectangle.BottomLeft.Y, queryRectangle.BottomRight.Y);
            var cal = Math.Min(queryRectangle.TopLeft.X, queryRectangle.BottomLeft.X);
            var car = Math.Max(queryRectangle.TopRight.X, queryRectangle.BottomRight.X);
            var cat = Math.Min(queryRectangle.TopLeft.Y, queryRectangle.TopRight.Y);

            var content = new MultipartFormDataContent("--------------------------498758971529224930840173");
            var image = await ImageUtils.GetImageAsync(imageUrl);
            content.Add(new ByteArrayContent(image)
            {
                Headers =
                {
                    ContentDisposition = new ContentDispositionHeaderValue("form-data")
                    {
                        Name = "image",
                        FileName = "image",
                    },
                    ContentType = new MediaTypeHeaderValue("image/jpeg"),
                },
            });

            BingVisualSearchResponse result = null;
            content.Headers.Add("Ocp-Apim-Subscription-Key", _bingSearchKey);
            using (var response = await Client.PostAsync($"{ServiceUri}/visualsearch?mkt=en-us&safeSearch=Strict&cab={cab}&cal={cal}&car={car}&cat={cat}", content))
            {
                var json = await response.Content.ReadAsStringAsync();
                result = JsonConvert.DeserializeObject<BingVisualSearchResponse>(json);
            }

            return result;
        }
    }
}
