using System;
using System.Collections.Generic;
using System.Linq;
using System.Threading.Tasks;

namespace ChatBot.Services
{
    using System.Diagnostics.CodeAnalysis;
    using System.Net.Http;
    using System.Threading.Tasks;
    using ChatBot.Models;
    using Newtonsoft.Json;

    public class DistanceMatrixService
    {
        private const string BingMapsUri = "http://dev.virtualearth.net/REST/v1/Routes/DistanceMatrix";
        private const string DistanceUnit = "mi"; // Miles: mi, Kilometers: km

        [SuppressMessage("Microsoft.Usage", "CA2213:DisposableFieldsShouldBeDisposed", Justification = "Avoiding Improper Instantiation antipattern : https://docs.microsoft.com/en-us/azure/architecture/antipatterns/improper-instantiation/")]
        private static readonly HttpClient Client = new HttpClient();
        private readonly string _bingServiceKey;

        public DistanceMatrixService(string bingMapsKey)
        {
            _bingServiceKey = bingMapsKey;
        }

        public async Task<BingMapsApiResult> GetRouteMatrixByLocationAndTimeAsync(string origins, string destinations, string startTime = "")
        {
            if (!string.IsNullOrEmpty(origins) && !string.IsNullOrEmpty(destinations))
            {
                var url = $"{BingMapsUri}?origins={origins}&destinations={destinations}&travelMode=Driving&distanceUnit={DistanceUnit}&startTime={startTime}&key={_bingServiceKey}";
                using (var response = await Client.GetAsync(url))
                {
                    response.EnsureSuccessStatusCode();
                    var json = await response.Content.ReadAsStringAsync();
                    return JsonConvert.DeserializeObject<BingMapsApiResult>(json);
                }
            }

            return null;
        }
    }
}