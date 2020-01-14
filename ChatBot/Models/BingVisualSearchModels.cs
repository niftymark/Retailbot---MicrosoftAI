using System.Collections.Generic;
using Newtonsoft.Json;

namespace ChatBot.Models
{
    public class BingVisualSearchResponse
    {
        [JsonProperty("_type")]
        public string Type { get; set; }

        public ImageInsight Image { get; set; }

        public ImageTag[] Tags { get; set; }

        public string ImageInsightsToken { get; set; }
    }

    public class ImageInsight
    {
        public string ImageInsightsToken { get; set; }
    }

    public class ImageTag
    {
        public string DisplayName { get; set; }

        public ImageActions[] Actions { get; set; }
    }

    public class BoundingRectangle
    {
        public BoundingCoordinate BottomLeft { get; set; }

        public BoundingCoordinate BottomRight { get; set; }

        public BoundingCoordinate TopLeft { get; set; }

        public BoundingCoordinate TopRight { get; set; }
    }

    public class BoundingCoordinate
    {
        public double X { get; set; }

        public double Y { get; set; }
    }

    public class ImageActions
    {
        [JsonProperty("_type")]
        public string Type { get; set; }

        public string ActionType { get; set; }

        public ImageActionsData Data { get; set; }
    }

    public class ImageObject
    {
        public double Height { get; set; }

        public double Width { get; set; }

        public string ContentUrl { get; set; }

        public string Name { get; set; }

        public string ThumbnailUrl { get; set; }
    }

    public class ImageActionsData
    {
        public ImageAction[] Value { get; set; }
    }

    public class ImageAction
    {
        public string ContentUrl { get; set; }

        public string Name { get; set; }

        public string ThumbnailUrl { get; set; }

        public double Height { get; set; }

        public double Width { get; set; }

        public ImageActionInsightsMetadata InsightsMetadata { get; set; }
    }

    public class ImageActionInsightsMetadata
    {
        public ImageActionAggregateOffers AggregateOffer { get; set; }
    }

    public class ImageActionAggregateOffers
    {
        public ImageActionAggregateOffer[] Offers { get; set; }
    }

    public class ImageActionAggregateOffer
    {
        public string Name { get; set; }

        public double Price { get; set; }

        public string Url { get; set; }

        public ImageActionAggregateOfferSeller Seller { get; set; }
    }

    public class ImageActionAggregateOfferSeller
    {
        public string Name { get; set; }
    }

    public class ObjectDetectionResponse
    {
        public string ImageInsightsToken { get; set; }

        public DetectedObjects DetectedObjects { get; set; }
    }

    public class DetectedObjects
    {
        public List<DetectedResult> DetectedResults { get; set; }
    }

    public class DetectedResult
    {
        public DetectedResultRectangule BoundingBox { get; set; }

        public DetectedResultRectangule HotSpot { get; set; }

        public List<DetectedResultTag> Tags { get; set; }
    }

    public class DetectedResultTag
    {
        public string Name { get; set; }
    }

    public class DetectedResultRectangule
    {
        public double Left { get; set; }

        public double Top { get; set; }

        public double Right { get; set; }

        public double Bottom { get; set; }
    }
}
