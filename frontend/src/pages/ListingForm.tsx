import { useState, useEffect, useRef } from "react";
import httpClient from "../httpClient";
import { useNavigate, useParams, Link } from "react-router-dom";
import { FaTrashAlt } from "react-icons/fa";
import { IoArrowBack } from "react-icons/io5";
import "../styles/ListingForm.css";
import TopNav from "../components/TopNav";
import { prepareImageFile } from "../utils/imageUpload";
import { MRT_STATIONS } from "../constants/mrtStations";

function capitalizeFirstLetter(value) {
    const trimmedValue = value.trim();
    if (!trimmedValue) return "";
    return trimmedValue.charAt(0).toUpperCase() + trimmedValue.slice(1);
}

export default function ListingForm() {
    const {id} = useParams();
    const editMode = Boolean(id);
    const [loading, setLoading] = useState(false)
    const [error, setError] = useState(null);
    const [aiDraft, setAiDraft] = useState("");
    const [aiDraftLoading, setAiDraftLoading] = useState(false);
    const [aiDraftError, setAiDraftError] = useState(null);
    const [imageAnalysis, setImageAnalysis] = useState(null);
    const [imageAnalysisLoading, setImageAnalysisLoading] = useState(false);
    const [imageAnalysisError, setImageAnalysisError] = useState(null);
    const [selectedSuggestions, setSelectedSuggestions] = useState({
        name: true,
        category: true,
        description: true,
        specifications: false,
        usageNotes: true,
        careNotes: true,
    });
    const navigate = useNavigate();

    const [form, setForm] = useState({
        name: "",
        description: "",
        category: "",
        location: "",         
        image_files: [],  
        image_url: "",
        image_urls: [],
       
    });
    const [authCheck, setAuthCheck] = useState(true);
    const [unauthorized, setUnauthorized] = useState(false);
    const [newImagePreviews, setNewImagePreviews] = useState([]);
    const newImagePreviewRef = useRef([]);
    const savedImagePreviews = form.image_urls.length > 0
        ? form.image_urls
        : (form.image_url ? [form.image_url] : []);
    const imagePreviews = [
        ...savedImagePreviews.map((url, index) => ({
            id: `saved-${url}-${index}`,
            url,
            type: "saved",
            index,
        })),
        ...newImagePreviews.map((url, index) => ({
            id: `new-${url}-${index}`,
            url,
            type: "new",
            index,
        })),
    ];

    useEffect(() => {
        async function init() {
          try {
            await httpClient.get("/api/auth/me");
          } catch {
            setUnauthorized(true);
          } finally {
            setAuthCheck(false);
          }
        }
        init();
      }, []);

    useEffect(() => {
        if (!editMode) return;
        async function fetchListing() {
            try {
                const res = await httpClient.get(`/api/listings/${id}`);
                const listing = res.data;
                setForm({
                    name: listing.name,
                    description: listing.description,
                    category: listing.category,
                    location: listing.location,
                    image_files: [],
                    image_url: listing.image_url || "",
                    image_urls: listing.image_urls?.length ? listing.image_urls : (listing.image_url ? [listing.image_url] : []),
                });
            } catch {
                setError("Failed to fetch listing");
            }
        }
        fetchListing();
    }, [id, editMode]);

    useEffect(() => {
        return () => {
            newImagePreviewRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
        };
    }, []);

    const handleImageChange = async (event) => {
        const files = Array.from(event.target.files || []) as File[];

        if (files.length === 0) {
            return;
        }

        try {
            const preparedFiles = await Promise.all(
                files.map((file, index) =>
                    prepareImageFile(file, {
                        label: `Listing image ${index + 1}`,
                        maxDimension: 1200
                    })
                )
            );
            const previewUrls = preparedFiles.map((file) => URL.createObjectURL(file));
            newImagePreviewRef.current = [...newImagePreviewRef.current, ...previewUrls];
            setNewImagePreviews((currentPreviews) => [...currentPreviews, ...previewUrls]);
            setForm({...form, image_files: [...form.image_files, ...preparedFiles]});
            setImageAnalysis(null);
            setImageAnalysisError(null);
            setError(null);
            event.target.value = "";
        } catch (err) {
            newImagePreviewRef.current.forEach((previewUrl) => URL.revokeObjectURL(previewUrl));
            newImagePreviewRef.current = [];
            setNewImagePreviews([]);
            setForm({...form, image_files: []});
            setError(err.message);
            event.target.value = "";
        }
    };

    const handleRemoveSavedImage = (indexToRemove) => {
        const nextImageUrls = form.image_urls.filter((_, index) => index !== indexToRemove);

        setForm({
            ...form,
            image_urls: nextImageUrls,
            image_url: nextImageUrls[0] || "",
        });
    };

    const handleRemoveNewImage = (indexToRemove) => {
        const previewToRemove = newImagePreviews[indexToRemove];
        if (previewToRemove) {
            URL.revokeObjectURL(previewToRemove);
        }

        newImagePreviewRef.current = newImagePreviewRef.current.filter(
            (previewUrl) => previewUrl !== previewToRemove
        );
        setNewImagePreviews((currentPreviews) =>
            currentPreviews.filter((_, index) => index !== indexToRemove)
        );
        setForm({
            ...form,
            image_files: form.image_files.filter((_, index) => index !== indexToRemove),
        });
        setImageAnalysis(null);
        setImageAnalysisError(null);
    };

    const handleRemoveImage = (preview) => {
        if (preview.type === "saved") {
            handleRemoveSavedImage(preview.index);
        } else {
            handleRemoveNewImage(preview.index);
        }
    };

    const validInputs = () => {
        if (
            form.name.trim() === "" ||
            form.description.trim() === "" ||
            form.category === "" ||
            form.location === "" ||
            imagePreviews.length === 0
        ) {
            setError("All fields are required.");
            return false;
        }
        return true;
    };

    async function handleDraftDescription() {
        const input = form.description.trim() || form.name.trim();
        const imageContext = imageAnalysis
            ? {
                detected_product: imageAnalysis.detected_product,
                suggestions: imageAnalysis.suggestions,
                selected_suggestions: selectedSuggestions,
            }
            : null;

        if (!input) {
            setAiDraftError("Add an item name or a few rough notes first.");
            return;
        }

        try {
            setAiDraftLoading(true);
            setAiDraftError(null);
            const res = await httpClient.post("/api/ai/draft", {
                mode: "listing_description",
                input,
                tone: "friendly",
                context: {
                    name: form.name,
                    category: form.category,
                    location: form.location,
                    image_analysis: imageContext,
                },
            });
            setAiDraft(res.data.draft);
        } catch (err) {
            setAiDraftError(
                err.response?.data?.detail || "Failed to draft a description"
            );
        } finally {
            setAiDraftLoading(false);
        }
    }

    function acceptAiDraft() {
        setForm({...form, description: aiDraft});
        setAiDraft("");
        setAiDraftError(null);
    }

    async function handleAnalyzeListingImage() {
        const imageFile = form.image_files[0];

        if (!imageFile) {
            setImageAnalysisError("Upload a new image first so AI can analyze it.");
            return;
        }

        try {
            setImageAnalysisLoading(true);
            setImageAnalysisError(null);
            const formData = new FormData();
            formData.append("file", imageFile);
            const res = await httpClient.post("/api/ai/analyze-listing-image", formData);
            setImageAnalysis(res.data);
        } catch (err) {
            setImageAnalysisError(
                err.response?.data?.detail || "Failed to analyze image"
            );
        } finally {
            setImageAnalysisLoading(false);
        }
    }

    function updateDetectedProduct(field, value) {
        setImageAnalysis((current) => ({
            ...current,
            detected_product: {
                ...current.detected_product,
                [field]: value,
            },
        }));
    }

    function toggleSuggestion(field) {
        setSelectedSuggestions((current) => ({
            ...current,
            [field]: !current[field],
        }));
    }

    function buildImageSuggestionDescriptionSections(suggestions) {
        const sections = [];

        if (selectedSuggestions.description && suggestions.description) {
            sections.push({
                label: "Product description:",
                text: suggestions.description,
            });
        }

        if (selectedSuggestions.usageNotes && suggestions.usage_notes) {
            sections.push({
                label: "Usage notes:",
                text: suggestions.usage_notes,
            });
        }

        if (selectedSuggestions.careNotes && suggestions.care_notes) {
            sections.push({
                label: "Care notes:",
                text: suggestions.care_notes,
            });
        }

        return sections;
    }

    function applyImageSuggestions() {
        if (!imageAnalysis) return;

        const { detected_product: detectedProduct, suggestions } = imageAnalysis;
        const descriptionSections = buildImageSuggestionDescriptionSections(suggestions);
        const descriptionText = descriptionSections
            .map((section) => `${section.label} ${section.text}`)
            .join("\n\n");

        setForm({
            ...form,
            name: selectedSuggestions.name && detectedProduct.name
                ? capitalizeFirstLetter(detectedProduct.name)
                : capitalizeFirstLetter(form.name),
            category: selectedSuggestions.category && suggestions.category
                ? suggestions.category
                : form.category,
            description: descriptionText
                ? descriptionText
                : form.description,
        });
        setImageAnalysis(null);
    }

    async function handleSubmit(e) {
        e.preventDefault();
        if (!validInputs()) {
            return;
        }
        try {
            setLoading(true);
            if(!editMode) {
                const res = await httpClient.post("/api/listings/create", {
                    name: capitalizeFirstLetter(form.name),
                    description: form.description,
                    category: form.category,
                    location: form.location,
                    image_url: "",
                    image_urls: [],
                });

                if (form.image_files.length > 0) {
                    const formData = new FormData();
                    form.image_files.forEach((file) => formData.append("files", file));
                    await httpClient.post(`/api/listings/${res.data.id}/images`, formData);
                }
            } else {
                await httpClient.put(`/api/listings/edit/${id}`, {
                    name: capitalizeFirstLetter(form.name),
                    description: form.description,
                    category: form.category,
                    location: form.location,
                    image_url: form.image_url,
                    image_urls: form.image_urls,
                });

                if (form.image_files.length > 0) {
                    const formData = new FormData();
                    form.image_files.forEach((file) => formData.append("files", file));
                    await httpClient.post(`/api/listings/${id}/images?replace=false`, formData);
                }
            }
            navigate("/home");
        } catch {
            if (!editMode) setError("Failed to create listing");
            else setError("Failed to update listing");
        } finally {
            setLoading(false);
        }
    }

    if (authCheck) {
        return (
            <>
                <TopNav />
                <p style={{padding: "30px"}}>Loading...</p>
            </>
        );
    }

    if (unauthorized) {
        return (
            <>
                <TopNav />
                <p style={{padding: "30px", color: "red"}}>
                    Please <Link to="/login" style={{ color: "red", textDecoration: "underline"}}>log in</Link> to list an item.
                </p>
            </>
        );
    }

    return (
        <>
        <TopNav />
        <div className="listing-form-page">
            <form className="listing-form" onSubmit={handleSubmit}>
                {editMode && (
                    <Link className="listing-form-back-link" to="/mylistings">
                        <IoArrowBack aria-hidden="true" />
                        <span>Back to My Listings</span>
                    </Link>
                )}
                <h1 className="listing-form-title">
                    {editMode ? "Edit Listing" : "Create New Listing"}
                </h1>
                <label htmlFor="image">
                    Images: 
                </label>
                <input
                    id="image"
                    type="file"
                    accept="image/*"
                    multiple
                    onChange={handleImageChange}
                />
                {imagePreviews.length > 0 && (
                    <div className="listing-image-preview">
                        {imagePreviews.map((preview, index) => (
                            <div className="listing-image-preview-item" key={preview.id}>
                                <img
                                    src={preview.url}
                                    alt={`Listing preview ${index + 1}`}
                                />
                                <button
                                    type="button"
                                    className="listing-image-delete-button"
                                    onClick={() => handleRemoveImage(preview)}
                                    aria-label={`Delete listing image ${index + 1}`}
                                    title="Delete image"
                                >
                                    <FaTrashAlt aria-hidden="true" />
                                </button>
                            </div>
                        ))}
                    </div>
                )}
                <section className="image-ai-helper" aria-label="AI product helper">
                    <div>
                        <strong>AI Product Helper</strong>
                        <p>Analyze the image to suggest item details.</p>
                    </div>
                    <button
                        type="button"
                        onClick={handleAnalyzeListingImage}
                        disabled={imageAnalysisLoading || form.image_files.length === 0}
                    >
                        {imageAnalysisLoading ? "Analyzing..." : "Analyze Image with AI"}
                    </button>
                    {imageAnalysisError && <span>{imageAnalysisError}</span>}
                </section>
                {imageAnalysis && (
                    <section className="image-ai-result" aria-label="AI image analysis result">
                        <div className="image-ai-result-header">
                            <div>
                                <strong>AI found a possible match</strong>
                                <p>Confidence: {imageAnalysis.detected_product.confidence}</p>
                            </div>
                        </div>

                        <label>
                            Suggested item name
                            <input
                                type="text"
                                value={imageAnalysis.detected_product.name}
                                onChange={(e) => updateDetectedProduct("name", e.target.value)}
                            />
                        </label>
                        <div className="image-ai-product-grid">
                            <label>
                                Brand
                                <input
                                    type="text"
                                    value={imageAnalysis.detected_product.brand}
                                    onChange={(e) => updateDetectedProduct("brand", e.target.value)}
                                    placeholder="Optional"
                                />
                            </label>
                            <label>
                                Model
                                <input
                                    type="text"
                                    value={imageAnalysis.detected_product.model}
                                    onChange={(e) => updateDetectedProduct("model", e.target.value)}
                                    placeholder="Optional"
                                />
                            </label>
                        </div>

                        {imageAnalysis.detected_product.uncertainty_note && (
                            <p>{imageAnalysis.detected_product.uncertainty_note}</p>
                        )}

                        <div className="image-ai-suggestions">
                            <strong>Apply suggestions</strong>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedSuggestions.name}
                                    onChange={() => toggleSuggestion("name")}
                                />
                                Item name
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedSuggestions.category}
                                    onChange={() => toggleSuggestion("category")}
                                />
                                Category: {imageAnalysis.suggestions.category}
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedSuggestions.description}
                                    onChange={() => toggleSuggestion("description")}
                                />
                                Description
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedSuggestions.usageNotes}
                                    onChange={() => toggleSuggestion("usageNotes")}
                                />
                                Usage notes
                            </label>
                            <label>
                                <input
                                    type="checkbox"
                                    checked={selectedSuggestions.careNotes}
                                    onChange={() => toggleSuggestion("careNotes")}
                                />
                                Care notes
                            </label>
                        </div>

                        {buildImageSuggestionDescriptionSections(imageAnalysis.suggestions).length > 0 && (
                            <div className="image-ai-copy">
                                {buildImageSuggestionDescriptionSections(imageAnalysis.suggestions).map((section) => (
                                    <p
                                        key={section.label}
                                        className={
                                            section.label === "Product description:"
                                                ? undefined
                                                : "image-ai-note-section"
                                        }
                                    >
                                        <strong>{section.label} </strong>{section.text}
                                    </p>
                                ))}
                            </div>
                        )}

                        <div className="image-ai-action-row">
                            <button type="button" className="image-ai-apply-button" onClick={applyImageSuggestions}>
                                Apply Selected
                            </button>
                            <button
                                type="button"
                                className="image-ai-discard-button"
                                onClick={() => setImageAnalysis(null)}
                            >
                                Discard
                            </button>
                        </div>
                    </section>
                )}
                {error && <p style={{color: "red", fontSize: "13px"}}>{error}</p>}
                <label htmlFor="name">Item Name:</label>
                <input
                    type="text"
                    value={form.name}
                    onChange={(e) => setForm({...form, name: e.target.value})}
                />
                <label htmlFor="category">Category:</label>
                <select value={form.category} onChange={(e) => setForm({...form, category: e.target.value})}>
                    <option value="">Select Category</option>
                    <option value="tools">Tools</option>
                    <option value="books">Books</option>
                    <option value="electronics">Electronics</option>
                    <option value="clothing">Clothing</option>
                    <option value="sports">Sports</option>
                    <option value="other">Other</option>
                </select>

                <label htmlFor="location">Nearest MRT Station:</label>
                <input
                    id="location"
                    type="text"
                    list="mrt-stations"
                    value={form.location}
                    onChange={(e) => setForm({...form, location: e.target.value})}
                    placeholder="Search for an MRT station"
                />
                <datalist id="mrt-stations">
                    {MRT_STATIONS.map((station) => (
                        <option key={station} value={station} />
                    ))}
                </datalist>

                <label htmlFor="description">Description:</label>
                <textarea
                    value={form.description}
                    onChange={(e) => setForm({...form, description: e.target.value})}
                    placeholder="Tell borrowers about the item: model, condition, size, included accessories, and anything to handle with care."
                />
                <div className="ai-draft-actions">
                    <button
                        type="button"
                        className="ai-draft-button"
                        onClick={handleDraftDescription}
                        disabled={aiDraftLoading}
                    >
                        {aiDraftLoading ? "Drafting..." : "Draft with AI"}
                    </button>
                    {aiDraftError && <span>{aiDraftError}</span>}
                </div>
                {aiDraft && (
                    <section className="ai-draft-preview" aria-label="AI description draft">
                        <p>{aiDraft}</p>
                        <div>
                            <button type="button" onClick={acceptAiDraft}>
                                Use Draft
                            </button>
                            <button type="button" onClick={() => setAiDraft("")}>
                                Discard
                            </button>
                        </div>
                    </section>
                )}

                <button type="submit" disabled={loading}>
                {loading
                    ? (editMode ? "Editing..." : "Creating...")
                    : (editMode ? "Edit" : "Create")
                }
</button>
            </form>
        </div>
        </>
    );
}
