using System;
using System.Collections.Generic;
using System.Linq;
using Newtonsoft.Json;

namespace ChatBot.Models
{
    public class SuggestedProductsResult
    {
        [JsonProperty("matching")]
        public IList<ProductModel> Matching { get; set; }

        [JsonProperty("suggested")]
        public IList<ProductModel> Suggested { get; set; }
    }
}
